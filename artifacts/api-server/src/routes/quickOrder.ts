import { Router } from "express";
import { pool } from "@workspace/db";
import { randomUUID } from "crypto";
import {
  sendDispatchNotification,
  sendCustomerDispatch,
} from "../lib/line.js";

const router = Router();

const RATE_PER_KM = 35;

function calcPeak(hour: number, peakRanges: string): boolean {
  const ranges = peakRanges.split(",").map((r) => r.trim());
  for (const r of ranges) {
    const [s, e] = r.split("-").map(Number);
    if (s <= e ? hour >= s && hour < e : hour >= s || hour < e) return true;
  }
  return false;
}

async function getPricingConfig(): Promise<Record<string, string>> {
  const { rows } = await pool.query("SELECT key, value FROM pricing_config");
  const cfg: Record<string, string> = {};
  for (const row of rows) cfg[row.key] = row.value;
  return cfg;
}

router.post("/quote", async (req, res) => {
  try {
    const {
      vehicle_type_id,
      distance_km,
      pickup_time,
    } = req.body as {
      vehicle_type_id: number;
      distance_km: number;
      pickup_time?: string;
    };

    if (!vehicle_type_id || !distance_km) {
      return res.status(400).json({ error: "缺少必填欄位" });
    }

    const { rows: vtRows } = await pool.query(
      "SELECT id, name, base_fee FROM vehicle_types WHERE id=$1",
      [vehicle_type_id]
    );
    if (!vtRows.length) return res.status(404).json({ error: "車型不存在" });
    const vt = vtRows[0];

    const cfg = await getPricingConfig();
    const peakMult = parseFloat(cfg.peak_multiplier ?? "1.2");
    const nightMult = parseFloat(cfg.night_multiplier ?? "1.3");
    const peakHours = cfg.peak_hours ?? "7-9,17-19";
    const nightHours = cfg.night_hours ?? "22-6";

    let multiplier = 1;
    let multiplierLabel = "";
    if (pickup_time) {
      const hour = new Date(pickup_time).getHours();
      if (calcPeak(hour, peakHours)) {
        multiplier = peakMult;
        multiplierLabel = `尖峰時段加成 ×${peakMult}`;
      } else if (calcPeak(hour, nightHours)) {
        multiplier = nightMult;
        multiplierLabel = `夜間時段加成 ×${nightMult}`;
      }
    }

    const baseFee = parseFloat(vt.base_fee ?? "0");
    const distanceFee = Math.round(distance_km * RATE_PER_KM);
    const subtotal = baseFee + distanceFee;
    const totalFee = Math.round(subtotal * multiplier);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    res.json({
      vehicle_type: { id: vt.id, name: vt.name },
      base_fee: baseFee,
      distance_fee: distanceFee,
      distance_km,
      multiplier,
      multiplier_label: multiplierLabel,
      total_fee: totalFee,
      expires_at: expiresAt,
      currency: "TWD",
    });
  } catch (err: any) {
    console.error("quick-order quote error:", err);
    res.status(500).json({ error: "報價失敗" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      guest_name,
      guest_phone,
      pickup_address,
      delivery_address,
      vehicle_type_id,
      distance_km,
      cargo_description,
      pickup_time,
      payment_method,
      total_fee,
      notes,
    } = req.body as {
      guest_name: string;
      guest_phone: string;
      pickup_address: string;
      delivery_address: string;
      vehicle_type_id: number;
      distance_km: number;
      cargo_description?: string;
      pickup_time?: string;
      payment_method: "cash" | "line_pay" | "credit_card" | "bank_transfer";
      total_fee: number;
      notes?: string;
    };

    if (!guest_name || !guest_phone || !pickup_address || !delivery_address || !payment_method || !total_fee) {
      return res.status(400).json({ error: "缺少必填欄位" });
    }

    const token = randomUUID();
    const isCash = payment_method === "cash";
    const dispatchBlocked = !isCash;
    const paymentRequired = !isCash;

    const { rows } = await pool.query(
      `INSERT INTO orders (
        customer_name, customer_phone,
        pickup_address, delivery_address,
        required_vehicle_type, cargo_description,
        pickup_date, notes,
        payment_method, payment_required,
        dispatch_blocked, total_fee, fee_status,
        status, auto_dispatch_enabled,
        quick_order_token, is_quick_order,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,
        'unpaid','pending',true,
        $13,true,NOW()
      ) RETURNING id`,
      [
        guest_name,
        guest_phone,
        pickup_address,
        delivery_address,
        vehicle_type_id,
        cargo_description ?? "",
        pickup_time ? new Date(pickup_time) : new Date(),
        notes ?? "",
        payment_method,
        paymentRequired,
        dispatchBlocked,
        total_fee,
        token,
      ]
    );

    const orderId = rows[0].id;

    if (isCash) {
      await triggerAutoDispatch(orderId);
    }

    const paymentInstructions = getPaymentInstructions(payment_method, total_fee, orderId);

    res.json({
      ok: true,
      order_id: orderId,
      token,
      track_url: `/quick/track/${token}`,
      payment_method,
      total_fee,
      payment_required: paymentRequired,
      payment_instructions: paymentInstructions,
    });
  } catch (err: any) {
    console.error("quick-order create error:", err);
    res.status(500).json({ error: "建立訂單失敗" });
  }
});

router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await pool.query(
      `SELECT o.*, d.name as driver_name, d.phone as driver_phone, d.license_plate as driver_plate
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id
       WHERE o.quick_order_token=$1`,
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: "找不到訂單" });
    const order = rows[0];
    res.json({
      order_id: order.id,
      status: order.status,
      pickup_address: order.pickup_address,
      delivery_address: order.delivery_address,
      total_fee: order.total_fee,
      payment_method: order.payment_method,
      payment_required: order.payment_required,
      dispatch_blocked: order.dispatch_blocked,
      fee_status: order.fee_status,
      pickup_date: order.pickup_date,
      created_at: order.created_at,
      customer_name: order.customer_name,
      driver: order.driver_id
        ? {
            name: order.driver_name,
            phone: order.driver_phone,
            plate: order.driver_plate,
          }
        : null,
    });
  } catch (err: any) {
    console.error("quick-order track error:", err);
    res.status(500).json({ error: "查詢失敗" });
  }
});

router.post("/:token/pay", async (req, res) => {
  try {
    const { token } = req.params;
    const { transaction_id } = req.body as { transaction_id?: string };

    const { rows } = await pool.query(
      "SELECT * FROM orders WHERE quick_order_token=$1",
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: "找不到訂單" });
    const order = rows[0];

    if (order.fee_status === "paid") {
      return res.json({ ok: true, message: "已付款" });
    }

    await pool.query(
      `UPDATE orders SET
        fee_status='paid',
        payment_confirmed_at=NOW(),
        payment_transaction_id=$1,
        dispatch_blocked=false
       WHERE id=$2`,
      [transaction_id ?? `QUICK-${order.id}`, order.id]
    );

    await triggerAutoDispatch(order.id);

    res.json({ ok: true, message: "付款確認，系統正在為您派車！" });
  } catch (err: any) {
    console.error("quick-order pay error:", err);
    res.status(500).json({ error: "付款確認失敗" });
  }
});

async function triggerAutoDispatch(orderId: number) {
  try {
    const cfg = await getPricingConfig();
    const autoEnabled = cfg.auto_dispatch === "true";
    if (!autoEnabled) return;

    const { rows: [order] } = await pool.query(
      "SELECT * FROM orders WHERE id=$1",
      [orderId]
    );
    if (!order || order.dispatch_blocked) return;

    const maxKm = parseFloat(cfg.max_dispatch_km ?? "85");
    const { rows: drivers } = await pool.query(`
      SELECT d.*
      FROM drivers d
      WHERE d.status='available'
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.driver_id=d.id AND o.status IN ('pending','assigned','in_transit')
        )
      LIMIT 5
    `);

    if (!drivers.length) return;

    const driver = drivers[0];
    await pool.query(
      `UPDATE orders SET
        driver_id=$1, status='assigned',
        auto_dispatched_at=NOW(), dispatch_attempts=COALESCE(dispatch_attempts,0)+1
       WHERE id=$2`,
      [driver.id, orderId]
    );

    try {
      await sendDispatchNotification(driver, {
        id: orderId,
        pickupAddress: order.pickup_address,
        deliveryAddress: order.delivery_address,
        totalFee: order.total_fee,
      } as any);
    } catch {}

    try {
      if (order.customer_phone) {
        await sendCustomerDispatch(order.customer_phone, driver, orderId);
      }
    } catch {}
  } catch (err) {
    console.error("quick-order auto-dispatch error:", err);
  }
}

function getPaymentInstructions(method: string, amount: number, orderId: number): string {
  switch (method) {
    case "cash":
      return "現金付款，司機到達時請備妥現金。";
    case "line_pay":
      return `請使用 LINE Pay 掃碼付款 NT$${amount.toLocaleString()}，付款完成後系統將自動派車。`;
    case "credit_card":
      return `請刷卡支付 NT$${amount.toLocaleString()}，系統確認後自動派車。`;
    case "bank_transfer":
      return `請轉帳 NT$${amount.toLocaleString()} 至帳號 012-3456789-001（富詠運輸），備註訂單 #${orderId}，完成後請點擊「確認付款」。`;
    default:
      return "";
  }
}

export { router as quickOrderRouter };
