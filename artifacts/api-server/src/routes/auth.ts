import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "crypto";
import { db, customersTable, driversTable, adminUsers, adminRoles, otpsTable, lineAccountsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { signJwt, verifyJwt, extractBearerToken } from "../lib/jwt.js";

const router: IRouter = Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RATE_MS = 60 * 1000;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()\+]/g, "");
}

function isValidTaiwanPhone(phone: string): boolean {
  return /^09\d{8}$/.test(phone);
}

function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(s + password).digest("hex");
  return `${s}:${hash}`;
}

function checkPassword(plain: string, stored: string): boolean {
  const [salt] = stored.split(":");
  return hashPassword(plain, salt) === stored;
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
  if (!resp.ok) throw new Error(`SMS send failed: HTTP ${resp.status}`);
  const text = await resp.text();
  if (text.startsWith("-")) throw new Error(`SMS API error: ${text}`);
}

// ── POST /auth/send-otp ──────────────────────────────────────────────────────
router.post("/auth/send-otp", async (req, res) => {
  try {
    const rawPhone = String(req.body?.phone ?? "").trim();
    const phone = normalizePhone(rawPhone);

    if (!isValidTaiwanPhone(phone)) {
      return res.status(400).json({ error: "請輸入有效的台灣手機號碼（09開頭，共10位）" });
    }

    const customers = await db.select().from(customersTable).where(eq(customersTable.phone, phone));
    if (!customers.length) {
      return res.status(404).json({ error: "此手機號碼尚未建立客戶帳號，請聯絡客服申請" });
    }

    const now = new Date();
    const existing = await db
      .select()
      .from(otpsTable)
      .where(and(eq(otpsTable.phone, phone), gt(otpsTable.expiresAt, now)));

    if (existing.length) {
      const sentAt = existing[0].createdAt.getTime();
      const waitMs = OTP_RATE_MS - (Date.now() - sentAt);
      if (waitMs > 0) {
        return res.status(429).json({ error: `請等待 ${Math.ceil(waitMs / 1000)} 秒後再重新發送` });
      }
    }

    await db.delete(otpsTable).where(eq(otpsTable.phone, phone));

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await db.insert(otpsTable).values({ phone, otp, expiresAt });

    await sendSmsOtp(phone, otp);

    const isDev = process.env.NODE_ENV !== "production";
    return res.json({ ok: true, ...(isDev ? { devOtp: otp } : {}) });
  } catch (err) {
    req.log.error({ err }, "Failed to send OTP");
    res.status(500).json({ error: "簡訊發送失敗，請稍後再試" });
  }
});

// ── POST /auth/login/customer ────────────────────────────────────────────────
router.post("/auth/login/customer", async (req, res) => {
  try {
    const rawPhone = String(req.body?.phone ?? "").trim();
    const phone = normalizePhone(rawPhone);
    const otp = String(req.body?.otp ?? "").trim();

    if (!isValidTaiwanPhone(phone) || !otp) {
      return res.status(400).json({ error: "請提供手機號碼與驗證碼" });
    }

    const now = new Date();
    const [entry] = await db
      .select()
      .from(otpsTable)
      .where(and(eq(otpsTable.phone, phone), gt(otpsTable.expiresAt, now)));

    if (!entry) {
      return res.status(400).json({ error: "驗證碼不存在或已過期，請重新發送" });
    }
    if (entry.otp !== otp) {
      return res.status(400).json({ error: "驗證碼不正確，請重新輸入" });
    }

    await db.delete(otpsTable).where(eq(otpsTable.phone, phone));

    const [customer] = await db.select().from(customersTable).where(eq(customersTable.phone, phone));
    if (!customer) return res.status(404).json({ error: "找不到此客戶帳號" });

    const token = signJwt({ role: "customer", id: customer.id, name: customer.name, phone: customer.phone });
    return res.json({ token, user: { id: customer.id, role: "customer", name: customer.name, phone: customer.phone } });
  } catch (err) {
    req.log.error({ err }, "Customer OTP login failed");
    res.status(500).json({ error: "登入失敗，請稍後再試" });
  }
});

// ── POST /auth/login/driver ──────────────────────────────────────────────────
router.post("/auth/login/driver", async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      return res.status(400).json({ error: "請提供帳號與密碼" });
    }
    const normalizedUser = username.trim().toLowerCase();
    const [driver] = await db.select().from(driversTable)
      .where(sql`lower(${driversTable.username}) = ${normalizedUser}`);
    if (!driver || !driver.password) {
      return res.status(401).json({ error: "帳號或密碼不正確" });
    }

    const isHashed = driver.password.includes(":");
    const valid = isHashed
      ? checkPassword(password, driver.password)
      : driver.password === password;

    if (!valid) return res.status(401).json({ error: "帳號或密碼不正確" });

    const token = signJwt({ role: "driver", id: driver.id, name: driver.name, phone: driver.phone });
    return res.json({ token, user: { id: driver.id, role: "driver", name: driver.name, phone: driver.phone } });
  } catch (err) {
    req.log.error({ err }, "Driver login failed");
    res.status(500).json({ error: "登入失敗，請稍後再試" });
  }
});

// ── POST /auth/login/admin ───────────────────────────────────────────────────
router.post("/auth/login/admin", async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      return res.status(400).json({ error: "請提供帳號與密碼" });
    }
    const [user] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.username, username.trim()), eq(adminUsers.isActive, true)));

    if (!user) return res.status(401).json({ error: "帳號或密碼錯誤" });
    const [salt] = user.passwordHash.split(":");
    if (hashPassword(password, salt) !== user.passwordHash) {
      return res.status(401).json({ error: "帳號或密碼錯誤" });
    }

    await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));

    const token = signJwt({ role: "admin", id: user.id, name: user.displayName, username: user.username });
    return res.json({ token, user: { id: user.id, role: "admin", name: user.displayName, username: user.username } });
  } catch (err) {
    req.log.error({ err }, "Admin login failed");
    res.status(500).json({ error: "登入失敗，請稍後再試" });
  }
});

// ── GET /auth/me ─────────────────────────────────────────────────────────────
router.get("/auth/me", (req, res) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: "未登入" });
  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ error: "Token 無效或已過期" });
  res.json({ id: payload.id, role: payload.role, name: payload.name, phone: payload.phone, username: payload.username });
});

// ── LINE Login OAuth ──────────────────────────────────────────────────────────
const LINE_LOGIN_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";

router.get("/auth/line/url", (req, res) => {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) return res.status(503).json({ error: "LINE Login 未設定" });

  const role = String(req.query.role ?? "customer");
  const appBase = process.env.APP_BASE_URL ?? "";
  const callbackUri = `${appBase}/api/auth/line/callback`;
  const state = Buffer.from(JSON.stringify({ role })).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: channelId,
    redirect_uri: callbackUri,
    state,
    scope: "profile openid",
  });

  res.json({ url: `${LINE_LOGIN_URL}?${params}` });
});

router.get("/auth/line/callback", async (req, res) => {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const appBase = process.env.APP_BASE_URL ?? "";

  if (!channelId || !channelSecret) return res.status(503).send("LINE Login 未設定");

  const { code, state, error: lineError } = req.query as Record<string, string>;
  if (lineError || !code) {
    return res.redirect(`${appBase}/login?error=line_cancelled`);
  }

  let role = "customer";
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
    role = parsed.role ?? "customer";
  } catch {}

  try {
    const callbackUri = `${appBase}/api/auth/line/callback`;
    const tokenResp = await fetch(LINE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUri,
        client_id: channelId,
        client_secret: channelSecret,
      }).toString(),
    });
    if (!tokenResp.ok) throw new Error("Token exchange failed");
    const { access_token } = await tokenResp.json() as { access_token: string };

    const profileResp = await fetch(LINE_PROFILE_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!profileResp.ok) throw new Error("Profile fetch failed");
    const profile = await profileResp.json() as { userId: string; displayName: string; pictureUrl?: string };

    const [existing] = await db
      .select()
      .from(lineAccountsTable)
      .where(eq(lineAccountsTable.lineUserId, profile.userId));

    if (existing) {
      await db.update(lineAccountsTable)
        .set({ displayName: profile.displayName, pictureUrl: profile.pictureUrl ?? null, updatedAt: new Date() })
        .where(eq(lineAccountsTable.lineUserId, profile.userId));

      if (existing.userType === "customer") {
        const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, Number(existing.userRefId)));
        if (customer) {
          const token = signJwt({ role: "customer", id: customer.id, name: customer.name, phone: customer.phone });
          return res.redirect(`${appBase}/login/callback?token=${token}`);
        }
      }
      if (existing.userType === "driver") {
        const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, Number(existing.userRefId)));
        if (driver) {
          const token = signJwt({ role: "driver", id: driver.id, name: driver.name, phone: driver.phone });
          return res.redirect(`${appBase}/login/callback?token=${token}`);
        }
      }
    }

    return res.redirect(`${appBase}/login/line-link?lineUserId=${encodeURIComponent(profile.userId)}&displayName=${encodeURIComponent(profile.displayName)}&role=${role}`);
  } catch (err) {
    req.log.error({ err }, "LINE callback failed");
    return res.redirect(`${appBase}/login?error=line_failed`);
  }
});

// ── POST /auth/register/customer ─────────────────────────────────────────────
// 一般客戶自助申請帳號（姓名 + 手機 + 密碼）
router.post("/auth/register/customer", async (req, res) => {
  try {
    const { name, phone: rawPhone, password } = req.body as { name?: string; phone?: string; password?: string };
    const name_ = (name ?? "").trim();
    const phone = normalizePhone((rawPhone ?? "").trim());
    const pwd   = (password ?? "").trim();

    if (!name_ || name_.length < 2)        return res.status(400).json({ error: "請輸入真實姓名（至少 2 字）" });
    if (!isValidTaiwanPhone(phone))         return res.status(400).json({ error: "請輸入有效的台灣手機號碼（09開頭，共10位）" });
    if (pwd.length < 6)                     return res.status(400).json({ error: "密碼至少 6 位" });

    const existing = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.phone, phone)).limit(1);
    if (existing.length) return res.status(409).json({ error: "此手機號碼已有帳號，請直接登入" });

    const hashed = hashPassword(pwd);
    const [customer] = await db.insert(customersTable).values({ name: name_, phone, password: hashed }).returning();
    const token = signJwt({ role: "customer", id: customer.id, name: customer.name, phone: customer.phone });
    return res.status(201).json({ token, user: { id: customer.id, role: "customer", name: customer.name, phone: customer.phone } });
  } catch (err) {
    req.log.error({ err }, "register customer failed");
    res.status(500).json({ error: "申請失敗，請稍後再試" });
  }
});

// ── POST /auth/register/enterprise ───────────────────────────────────────────
// 企業客戶自助申請（公司名稱 + 聯絡人 + 手機 + 統編 + 密碼）
router.post("/auth/register/enterprise", async (req, res) => {
  try {
    const { companyName, contactPerson, phone: rawPhone, taxId, address, password } = req.body as {
      companyName?: string; contactPerson?: string; phone?: string; taxId?: string; address?: string; password?: string;
    };
    const name_ = (companyName ?? "").trim();
    const contact = (contactPerson ?? "").trim();
    const phone   = normalizePhone((rawPhone ?? "").trim());
    const pwd     = (password ?? "").trim();

    if (!name_ || name_.length < 2)   return res.status(400).json({ error: "請輸入公司名稱" });
    if (!contact)                      return res.status(400).json({ error: "請輸入聯絡人姓名" });
    if (!isValidTaiwanPhone(phone))    return res.status(400).json({ error: "請輸入有效的台灣手機號碼" });
    if (pwd.length < 6)               return res.status(400).json({ error: "密碼至少 6 位" });

    const existing = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.phone, phone)).limit(1);
    if (existing.length) return res.status(409).json({ error: "此手機號碼已有帳號，請直接登入" });

    const hashed = hashPassword(pwd);
    const [customer] = await db.insert(customersTable).values({
      name: name_, phone, password: hashed,
      contactPerson: contact,
      taxId: (taxId ?? "").trim() || null,
      address: (address ?? "").trim() || null,
    }).returning();
    const token = signJwt({ role: "customer", id: customer.id, name: customer.name, phone: customer.phone });
    return res.status(201).json({ token, user: { id: customer.id, role: "customer", name: customer.name, phone: customer.phone } });
  } catch (err) {
    req.log.error({ err }, "register enterprise failed");
    res.status(500).json({ error: "申請失敗，請稍後再試" });
  }
});

// ── POST /auth/register/driver ────────────────────────────────────────────────
// 司機自助申請（姓名 + 手機 + 車種 + 車牌 + 密碼）→ 後台審核後啟用
router.post("/auth/register/driver", async (req, res) => {
  try {
    const { name, phone: rawPhone, vehicleType, licensePlate, password } = req.body as {
      name?: string; phone?: string; vehicleType?: string; licensePlate?: string; password?: string;
    };
    const name_  = (name ?? "").trim();
    const phone  = normalizePhone((rawPhone ?? "").trim());
    const vType  = (vehicleType ?? "").trim();
    const plate  = (licensePlate ?? "").trim().toUpperCase();
    const pwd    = (password ?? "").trim();

    if (!name_ || name_.length < 2)  return res.status(400).json({ error: "請輸入真實姓名" });
    if (!isValidTaiwanPhone(phone))  return res.status(400).json({ error: "請輸入有效的台灣手機號碼" });
    if (!vType)                      return res.status(400).json({ error: "請選擇車種" });
    if (!plate || plate.length < 4)  return res.status(400).json({ error: "請輸入有效車牌" });
    if (pwd.length < 6)              return res.status(400).json({ error: "密碼至少 6 位" });

    const existing = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.phone, phone)).limit(1);
    if (existing.length) return res.status(409).json({ error: "此手機號碼已有司機帳號" });

    const hashed   = hashPassword(pwd);
    const username = `d${phone.slice(-6)}`;
    await db.insert(driversTable).values({
      name: name_, phone, vehicleType: vType, licensePlate: plate,
      username, password: hashed, status: "offline",
    });
    return res.status(201).json({ ok: true, message: "申請成功！資料審核通過後即可登入，我們將以電話通知您。" });
  } catch (err) {
    req.log.error({ err }, "register driver failed");
    res.status(500).json({ error: "申請失敗，請稍後再試" });
  }
});

// ── POST /auth/login/customer/password ────────────────────────────────────────
// 一般/企業客戶以手機 + 密碼登入（替代 OTP）
router.post("/auth/login/customer/password", async (req, res) => {
  try {
    const phone = normalizePhone(String(req.body?.phone ?? "").trim());
    const pwd   = String(req.body?.password ?? "").trim();
    if (!phone || !pwd) return res.status(400).json({ error: "請提供手機號碼與密碼" });

    const [customer] = await db.select().from(customersTable).where(eq(customersTable.phone, phone)).limit(1);
    if (!customer || !customer.password) return res.status(401).json({ error: "帳號不存在或尚未設定密碼" });
    if (!checkPassword(pwd, customer.password)) return res.status(401).json({ error: "密碼錯誤" });

    const token = signJwt({ role: "customer", id: customer.id, name: customer.name, phone: customer.phone });
    return res.json({ token, user: { id: customer.id, role: "customer", name: customer.name, phone: customer.phone } });
  } catch (err) {
    req.log.error({ err }, "customer password login failed");
    res.status(500).json({ error: "登入失敗" });
  }
});

// ── POST /auth/line/link ──────────────────────────────────────────────────────
router.post("/auth/line/link", async (req, res) => {
  try {
    const { lineUserId, displayName, pictureUrl, phone, role } = req.body as {
      lineUserId: string; displayName: string; pictureUrl?: string; phone: string; role: string;
    };
    if (!lineUserId || !phone) return res.status(400).json({ error: "缺少必要資料" });

    const normalizedPhone = normalizePhone(phone);
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.phone, normalizedPhone));
    if (!customer) return res.status(404).json({ error: "找不到此手機號碼的客戶帳號" });

    await db.insert(lineAccountsTable)
      .values({ userType: role ?? "customer", userRefId: String(customer.id), lineUserId, displayName, pictureUrl: pictureUrl ?? null })
      .onConflictDoUpdate({ target: lineAccountsTable.lineUserId, set: { displayName, pictureUrl: pictureUrl ?? null, updatedAt: new Date(), userRefId: String(customer.id) } });

    const token = signJwt({ role: "customer", id: customer.id, name: customer.name, phone: customer.phone });
    return res.json({ token, user: { id: customer.id, role: "customer", name: customer.name, phone: customer.phone } });
  } catch (err) {
    req.log.error({ err }, "LINE link failed");
    res.status(500).json({ error: "綁定失敗" });
  }
});

export default router;
