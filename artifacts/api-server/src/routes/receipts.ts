import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

export const receiptsRouter = Router();

function getOpenAI() {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy";
  if (!baseURL) throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL is not set");
  return new OpenAI({ baseURL, apiKey });
}

// POST /api/receipts/ocr
// Body: { imageBase64: string (data URI or raw base64), imageUrl?: string, orderId?: number }
receiptsRouter.post("/receipts/ocr", async (req, res) => {
  try {
    const { imageBase64, imageUrl, orderId } = req.body as {
      imageBase64?: string;
      imageUrl?: string;
      orderId?: number;
    };

    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ ok: false, error: "需提供 imageBase64 或 imageUrl" });
    }

    const openai = getOpenAI();

    // Build image content
    const imageContent: OpenAI.Chat.ChatCompletionContentPart = imageUrl
      ? { type: "image_url", image_url: { url: imageUrl } }
      : {
          type: "image_url",
          image_url: {
            url: imageBase64!.startsWith("data:") ? imageBase64! : `data:image/jpeg;base64,${imageBase64}`,
          },
        };

    const prompt = `你是富詠運輸的智慧 OCR 系統。請分析這張運送簽收單/收據圖片，並以 JSON 格式回傳以下資訊（找不到的欄位填 null）：

{
  "orderNumber": "訂單編號（字串）",
  "driverName": "司機姓名（字串）",
  "driverLicensePlate": "車牌（字串）",
  "customerName": "客戶/收件人姓名（字串）",
  "pickupAddress": "取貨地址（字串）",
  "deliveryAddress": "送達地址（字串）",
  "deliveryDate": "送達日期 YYYY-MM-DD 格式（字串）",
  "deliveryTime": "送達時間 HH:mm（字串）",
  "amount": "運費金額（數字，無單位）",
  "cargoDescription": "貨品描述（字串）",
  "cargoQuantity": "件數（數字）",
  "cargoWeightKg": "重量kg（數字）",
  "notes": "備註（字串）",
  "isSignedByRecipient": true/false,
  "confidence": 0.0-1.0（辨識信心值）
}

請只回傳 JSON，不要加任何說明文字。`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            imageContent,
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const rawText = completion.choices[0]?.message?.content ?? "{}";
    let extracted: Record<string, any> = {};
    try {
      extracted = JSON.parse(rawText);
    } catch {
      extracted = { parseError: true, raw: rawText };
    }

    // Auto-calculate commission if amount found
    let commissionCalc: Record<string, any> | null = null;
    if (extracted.amount && typeof extracted.amount === "number") {
      // Default driver commission rate is 85% (platform takes 15%)
      const platformRate = 0.15;
      const driverRate = 1 - platformRate;
      const platformFee = Math.round(extracted.amount * platformRate);
      const driverEarning = Math.round(extracted.amount * driverRate);

      // Try to get driver's actual commission rate
      if (extracted.driverName || extracted.driverLicensePlate) {
        const driverRows = await db.execute(sql`
          SELECT id, name, commission_rate, license_plate
          FROM drivers
          WHERE name ILIKE ${`%${extracted.driverName ?? ""}%`}
             OR license_plate = ${extracted.driverLicensePlate ?? ""}
          LIMIT 1
        `);
        const driverRow = (driverRows.rows as any[])[0];
        if (driverRow) {
          const actualPlatformRate = (parseFloat(driverRow.commission_rate) || 15) / 100;
          commissionCalc = {
            driverId: driverRow.id,
            driverName: driverRow.name,
            amount: extracted.amount,
            platformRate: actualPlatformRate * 100,
            driverRate: (1 - actualPlatformRate) * 100,
            platformFee: Math.round(extracted.amount * actualPlatformRate),
            driverEarning: Math.round(extracted.amount * (1 - actualPlatformRate)),
          };
        }
      }

      if (!commissionCalc) {
        commissionCalc = {
          amount: extracted.amount,
          platformRate: platformRate * 100,
          driverRate: driverRate * 100,
          platformFee,
          driverEarning,
        };
      }
    }

    // If orderId given, try to match with existing order
    let matchedOrder: Record<string, any> | null = null;
    const lookupId = orderId || (extracted.orderNumber ? parseInt(extracted.orderNumber) : null);
    if (lookupId) {
      const orderRows = await db.execute(sql`
        SELECT id, status, total_fee, driver_id, pickup_address, delivery_address, customer_name
        FROM orders WHERE id = ${lookupId} LIMIT 1
      `);
      const orderRow = (orderRows.rows as any[])[0];
      if (orderRow) {
        matchedOrder = {
          id: orderRow.id,
          status: orderRow.status,
          totalFee: orderRow.total_fee,
          driverId: orderRow.driver_id,
          pickupAddress: orderRow.pickup_address,
          deliveryAddress: orderRow.delivery_address,
          customerName: orderRow.customer_name,
        };
      }
    }

    res.json({
      ok: true,
      extracted,
      commissionCalc,
      matchedOrder,
      tokens: completion.usage?.total_tokens,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/receipts/confirm-settlement
// Create AR/AP record based on OCR result
receiptsRouter.post("/receipts/confirm-settlement", async (req, res) => {
  try {
    const {
      orderId,
      driverId,
      amount,
      platformFee,
      driverEarning,
      deliveryDate,
      notes,
      podPhotoUrl,
    } = req.body as {
      orderId?: number;
      driverId?: number;
      amount: number;
      platformFee: number;
      driverEarning: number;
      deliveryDate?: string;
      notes?: string;
      podPhotoUrl?: string;
    };

    // Update order if given
    if (orderId) {
      await db.execute(sql`
        UPDATE orders
        SET status = 'delivered',
            total_fee = ${amount},
            fee_status = 'pending',
            pod_photo_url = ${podPhotoUrl ?? null},
            pod_note = ${notes ?? null},
            delivered_at = ${deliveryDate ? new Date(deliveryDate) : new Date()}
        WHERE id = ${orderId}
      `);
    }

    // Create AR record (platform receivable)
    const arRef = `OCR-${Date.now()}`;
    await db.execute(sql`
      INSERT INTO ar_ledger (
        order_id, amount, type, description, reference_no, status, created_at
      )
      VALUES (
        ${orderId ?? null},
        ${platformFee},
        'platform_commission',
        ${`OCR 簽單確認 - 抽成 NT$${platformFee}`},
        ${arRef},
        'pending',
        NOW()
      )
      ON CONFLICT DO NOTHING
    `);

    // Create driver earnings record
    if (driverId) {
      await db.execute(sql`
        INSERT INTO driver_earnings (
          driver_id, order_id, amount, commission_amount, net_amount,
          description, status, created_at
        )
        VALUES (
          ${driverId},
          ${orderId ?? null},
          ${amount},
          ${platformFee},
          ${driverEarning},
          ${`OCR 自動結算 - 司機應收 NT$${driverEarning}`},
          'pending',
          NOW()
        )
        ON CONFLICT DO NOTHING
      `);
    }

    res.json({ ok: true, arRef, platformFee, driverEarning });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
