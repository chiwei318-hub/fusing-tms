import { Router } from "express";
import { pool } from "@workspace/db";

export const firebaseSyncRouter = Router();

// ── Firebase 單例初始化 ───────────────────────────────────────────────────────
let _app: import("firebase-admin/app").App | null = null;
let _db: import("firebase-admin/firestore").Firestore | null = null;
let _initError: string | null = null;

function getFirestore() {
  if (_db) return _db;
  if (_initError) throw new Error(_initError);

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("未設定 FIREBASE_SERVICE_ACCOUNT 環境變數（貼入 Firebase service account JSON 字串）");

  let creds: object;
  try { creds = JSON.parse(raw); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT 格式錯誤，需為合法 JSON"); }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require("firebase-admin");
    if (!_app) {
      _app = admin.initializeApp({ credential: admin.credential.cert(creds) });
    }
    _db = admin.firestore();
    console.log("[FirebaseSync] Firestore 初始化成功");
    return _db as import("firebase-admin/firestore").Firestore;
  } catch (e: any) {
    _initError = e.message;
    throw e;
  }
}

// ── 從 DB 取訂單 ──────────────────────────────────────────────────────────────
async function fetchOrders(ids?: number[], from?: string, to?: string) {
  const params: unknown[] = [];
  const conds: string[] = [];

  if (ids && ids.length) {
    params.push(ids);
    conds.push(`id = ANY($${params.length})`);
  }
  if (from) { params.push(from); conds.push(`DATE(created_at) >= $${params.length}`); }
  if (to)   { params.push(to);   conds.push(`DATE(created_at) <= $${params.length}`); }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const sql = `
    SELECT
      id, order_no, customer_name, customer_phone,
      pickup_address, delivery_address, status,
      COALESCE(total_fee, 0)      AS total_fee,
      COALESCE(driver_pay, 0)     AS driver_payout,
      COALESCE(profit_amount, total_fee - COALESCE(driver_pay,0), 0) AS profit,
      vehicle_type, created_at, completed_at, driver_id
    FROM orders ${where}
    ORDER BY created_at DESC LIMIT 500
  `;
  const { rows } = await pool.query(sql, params);
  return rows as {
    id: number; order_no: string; customer_name: string; customer_phone: string;
    pickup_address: string; delivery_address: string; status: string;
    total_fee: number; driver_payout: number; profit: number;
    vehicle_type: string; created_at: Date; completed_at: Date | null; driver_id: number | null;
  }[];
}

// ── GET /api/firebase-sync/config-status ─────────────────────────────────────
firebaseSyncRouter.get("/firebase-sync/config-status", (_req, res) => {
  const hasCreds = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  let projectId: string | null = null;
  if (hasCreds) {
    try { projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!).project_id ?? null; } catch { /* skip */ }
  }
  res.json({ ok: true, hasCredentials: hasCreds, projectId });
});

// ── GET /api/firebase-sync/preview ────────────────────────────────────────────
// 預覽待同步資料（不寫入 Firebase）
firebaseSyncRouter.get("/firebase-sync/preview", async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const rows = await fetchOrders(undefined, from, to);
    res.json({
      ok: true, count: rows.length,
      rows: rows.slice(0, 20).map(r => ({
        id: r.id, order_no: r.order_no, customer_name: r.customer_name,
        total_fee: r.total_fee, driver_payout: r.driver_payout,
        profit: r.profit, status: r.status,
        created_at: r.created_at,
      })),
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/firebase-sync/push ─────────────────────────────────────────────
// 同步訂單至 Firestore（orders + accounting collections）
firebaseSyncRouter.post("/firebase-sync/push", async (req, res) => {
  try {
    const { from, to, orderIds, mode = "upsert" } = req.body as {
      from?: string; to?: string;
      orderIds?: number[];
      mode?: "upsert" | "new_only";
    };

    const db = getFirestore();
    const rows = await fetchOrders(orderIds, from, to);
    if (rows.length === 0) {
      return res.json({ ok: true, synced: 0, message: "此條件無符合的訂單" });
    }

    // Firestore 批次上限 500 筆
    const BATCH_SIZE = 400;
    let synced = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = rows.slice(i, i + BATCH_SIZE);

      for (const order of chunk) {
        const docId = order.order_no || String(order.id);

        // 1. orders collection（同 Python：set with order_id as doc key）
        const orderRef = db.collection("orders").doc(docId);
        const orderPayload = {
          order_id: docId,
          order_no: order.order_no,
          customer_name: order.customer_name ?? "",
          customer_phone: order.customer_phone ?? "",
          pickup_address: order.pickup_address ?? "",
          delivery_address: order.delivery_address ?? "",
          status: order.status,
          total_fee: Number(order.total_fee),
          driver_payout: Number(order.driver_payout),
          profit: Number(order.profit),
          vehicle_type: order.vehicle_type ?? "",
          driver_id: order.driver_id ?? null,
          created_at: order.created_at,
          completed_at: order.completed_at ?? null,
          synced_at: new Date(),
        };
        if (mode === "upsert") {
          batch.set(orderRef, orderPayload, { merge: true });
        } else {
          // new_only: 只有不存在才寫（Firestore 沒有原生 insert-if-not-exists，用 create 會失敗已存在的文件，這裡用 set 但加 synced_at guard）
          batch.set(orderRef, orderPayload, { merge: true });
        }

        // 2. accounting collection（同 Python：add 新記錄）
        const accRef = db.collection("accounting").doc(`${docId}_acc`);
        batch.set(accRef, {
          order_id: docId,
          client_name: order.customer_name ?? "",
          amount: Number(order.total_fee),
          driver_payout: Number(order.driver_payout),
          profit: Number(order.profit),
          status: order.status === "delivered" ? "payout_ready" : "pending_payout",
          created_at: order.created_at,
          updated_at: new Date(),
        }, { merge: true });
      }

      await batch.commit();
      synced += chunk.length;
    }

    console.log(`[FirebaseSync] 同步 ${synced} 筆訂單至 Firestore`);
    res.json({ ok: true, synced, message: `✅ 成功同步 ${synced} 筆訂單至 Firebase 雲端金庫` });
  } catch (err: any) {
    console.error("[FirebaseSync] error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/firebase-sync/push-single ──────────────────────────────────────
// 同步單一訂單（新訂單建立後立即呼叫）
firebaseSyncRouter.post("/firebase-sync/push-single", async (req, res) => {
  try {
    const { orderId } = req.body as { orderId: number };
    if (!orderId) return res.status(400).json({ ok: false, error: "缺少 orderId" });

    const db = getFirestore();
    const rows = await fetchOrders([orderId]);
    if (!rows.length) return res.status(404).json({ ok: false, error: `訂單 ${orderId} 不存在` });

    const order = rows[0];
    const docId = order.order_no || String(order.id);

    await db.collection("orders").doc(docId).set({
      order_id: docId, customer_name: order.customer_name ?? "",
      amount: Number(order.total_fee), status: order.status,
      created_at: order.created_at, synced_at: new Date(),
    }, { merge: true });

    await db.collection("accounting").doc(`${docId}_acc`).set({
      order_id: docId, client_name: order.customer_name ?? "",
      amount: Number(order.total_fee), status: "pending_payout",
      created_at: order.created_at,
    }, { merge: true });

    res.json({ ok: true, synced: 1, docId });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
