import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { db, ordersTable } from "@workspace/db";
import { sendNewOrderAlertToCompany } from "../lib/line.js";

const router: IRouter = Router();

const SYSTEM_PROMPT = `你是「富詠運輸AI客服」。

你的任務是：接單 → 收集資料 → 報價 → 派車。

請嚴格按照流程：

【接單流程】
1. 詢問起運地
2. 詢問送達地
3. 詢問車型（3.5T / 5T / 17T）
4. 詢問貨物類型
5. 詢問重量或尺寸
6. 詢問時間
7. 詢問是否需要：
   - 尾門
   - 搬運
   - 冷鏈
8. 詢問聯絡電話（必填）
9. 詢問姓名

【報價規則】
- 基本運費：1500
- 每公里：30
- 尾門：+300
- 搬運：+800
- 冷鏈：+1000
- 急件（當天需求）：+500

【回覆規則】
✔ 不要講廢話
✔ 用簡短句子
✔ 一次問一題
✔ 收集完再報價
✔ 距離請根據台灣實際城市距離估算

【報價格式】
🚚 運費：$XXXX
📍 路線：起點→終點
🚛 車型：XXX
📋 附加服務：（如有）

最後一定要問：
👉 是否確認派車？

若客戶確認，回覆：
✅ 好的！您的訂單已記錄，我們的人員將盡快與您確認細節。感謝使用富詠運輸！`;

const EXTRACTION_SYSTEM = `你是資料萃取助手。根據對話紀錄，萃取訂單資料。
只回覆JSON，不要任何其他文字，不要 markdown 代碼塊。
JSON格式（所有欄位都必須存在）：
{
  "customerName": "姓名（若未提及則填空字串）",
  "customerPhone": "電話（若未提及則填空字串）",
  "pickupAddress": "取貨地址（盡可能完整）",
  "deliveryAddress": "送達地址（盡可能完整）",
  "cargoDescription": "貨物描述，含車型和附加服務",
  "cargoWeight": 0,
  "notes": "備註（含附加服務：尾門/搬運/冷鏈/急件、時間需求等）"
}`;

function isOrderConfirmed(content: string): boolean {
  return (
    content.includes("✅") &&
    (content.includes("訂單已記錄") || content.includes("感謝使用富詠"))
  );
}

function getOpenAIClient() {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy";
  if (!baseURL) throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL is not set");
  return new OpenAI({ baseURL, apiKey });
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function extractOrderData(
  openai: OpenAI,
  history: ChatMessage[]
): Promise<Record<string, unknown>> {
  const conversationText = history
    .map((m) => `${m.role === "user" ? "客戶" : "AI客服"}：${m.content}`)
    .join("\n");

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM },
        { role: "user", content: conversationText },
      ],
      stream: false,
    });

    const text = resp.choices[0]?.message?.content ?? "{}";
    return JSON.parse(text.trim());
  } catch {
    return {};
  }
}

router.post("/ai-chat/message", async (req, res) => {
  const { messages } = req.body as { messages: ChatMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const openai = getOpenAIClient();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      stream: true,
    });

    let fullContent = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);

    if (isOrderConfirmed(fullContent)) {
      try {
        const extracted = await extractOrderData(openai, [
          ...messages,
          { role: "assistant", content: fullContent },
        ]);

        const pickupAddress = String(extracted.pickupAddress ?? "").trim();
        const deliveryAddress = String(extracted.deliveryAddress ?? "").trim();
        const cargoDescription = String(extracted.cargoDescription ?? "AI客服下單").trim();
        const customerName = String(extracted.customerName ?? "AI客服訂單").trim() || "AI客服訂單";
        const customerPhone = String(extracted.customerPhone ?? "").trim() || "待確認";
        const cargoWeight = typeof extracted.cargoWeight === "number" ? extracted.cargoWeight : null;
        const notes = String(extracted.notes ?? "").trim() || null;

        if (pickupAddress && deliveryAddress) {
          const [order] = await db
            .insert(ordersTable)
            .values({
              customerName,
              customerPhone,
              pickupAddress,
              deliveryAddress,
              cargoDescription: cargoDescription || "AI客服下單",
              cargoWeight,
              notes: notes ? `[AI客服下單] ${notes}` : "[AI客服下單]",
              status: "pending",
              feeStatus: "unpaid",
            })
            .returning();

          res.write(`data: ${JSON.stringify({ orderId: order.id, orderCreated: true })}\n\n`);
          req.log.info({ orderId: order.id }, "[AI Chat] Order created from conversation");
          setImmediate(() => {
            sendNewOrderAlertToCompany(order).catch((e: unknown) =>
              req.log.warn({ e }, "[AI Chat] LINE notify failed")
            );
          });
        }
      } catch (dbErr) {
        req.log.error({ dbErr }, "[AI Chat] Failed to create order after confirmation");
      }
    }

    res.end();
  } catch (err) {
    console.error("[AI Chat] Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "AI service error" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "AI service error" })}\n\n`);
      res.end();
    }
  }
});

export default router;
