import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { db, ordersTable } from "@workspace/db";
import { sendNewOrderAlertToCompany } from "../lib/line.js";

const router: IRouter = Router();

const SYSTEM_PROMPT = `你是「富詠運輸 AI 接單系統」。

【核心目標】
客戶一句話 → 立即解析 → 立即報價 → 確認 → 派車。
高效率。不繞彎路。

【解析欄位】從客戶的句子中抓取以下資訊：
- pickup：起點（城市或地址）
- dropoff：終點（城市或地址）
- truck：車型（3.5T / 5T / 10T / 17T，若未提及，依貨物特性推估）
- cargo：貨物描述
- time：時間（若說「明天」「今天下午」請轉成具體描述）
- extras：附加服務陣列，可含 "尾門"、"搬運"、"冷鏈"、"急件"

【報價公式】
基本：1500
+ 距離 × 30（根據台灣實際城市距離估算，請給整數公里）
+ 尾門：+300
+ 搬運：+800
+ 冷鏈：+1000
+ 急件（當天）：+500

【回覆規則】
1. 如果一句話已有足夠資訊（起點＋終點至少要有）→ 立即報價，同時附上 JSON
2. 如果缺少關鍵資訊 → 最多只問 2 個問題，一次問完
3. 回覆要簡短有力，不廢話

【回覆格式（有足夠資訊時）】
一段簡短的自然語句報價說明，例如：
「台北→高雄，5T車，含搬運，預估距離 350 公里，報價如下 👇」

接著輸出 JSON 區塊（必須包在 ===JSON_START=== 和 ===JSON_END=== 之間）：

===JSON_START===
{
  "pickup": "起點",
  "dropoff": "終點",
  "truck": "車型",
  "cargo": "貨物",
  "time": "時間",
  "distance_km": 距離公里數,
  "base": 1500,
  "extras": ["尾門","搬運"],
  "extras_fee": 附加費用總計,
  "price": 總報價,
  "breakdown": "1500基本 + 350km×30=10500 + 搬運800 = 12800"
}
===JSON_END===

最後加一行：
👉 請問是否確認派車？

【確認派車後】
客戶說「確認」「好」「派車」「OK」時：
1. 詢問姓名和電話（如果之前沒有）→ 一次問兩個
2. 收到後回覆：
✅ 好的！訂單已建立，我們的調度員將盡快與您確認。感謝使用富詠運輸！

【車型推估參考】
- 小型雜貨/電器：3.5T
- 家具/辦公設備：5T
- 工業機具/大型貨物：10T
- 整批/倉庫搬遷：17T`;

const EXTRACTION_SYSTEM_V2 = `你是資料萃取助手。根據對話紀錄和已解析的JSON，萃取最終訂單資料。
只回覆JSON，不要任何其他文字，不要 markdown 代碼塊。
JSON格式（所有欄位都必須存在）：
{
  "customerName": "姓名（若未提及則填空字串）",
  "customerPhone": "電話（若未提及則填空字串）",
  "pickupAddress": "取貨地址（盡可能完整）",
  "deliveryAddress": "送達地址（盡可能完整）",
  "cargoDescription": "貨物描述，含車型和附加服務",
  "cargoWeight": 0,
  "totalFee": 報價金額（數字）,
  "notes": "備註（含附加服務：尾門/搬運/冷鏈/急件、時間需求等）"
}`;

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

function parseEmbeddedJson(content: string): Record<string, unknown> | null {
  const start = content.indexOf("===JSON_START===");
  const end = content.indexOf("===JSON_END===");
  if (start === -1 || end === -1) return null;
  try {
    const jsonStr = content.slice(start + 16, end).trim();
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function isOrderConfirmed(content: string): boolean {
  return (
    content.includes("✅") &&
    (content.includes("訂單已建立") || content.includes("感謝使用富詠"))
  );
}

async function extractOrderData(
  openai: OpenAI,
  history: ChatMessage[],
  parsedQuote: Record<string, unknown> | null
): Promise<Record<string, unknown>> {
  const conversationText = history
    .map((m) => `${m.role === "user" ? "客戶" : "AI"}：${m.content.replace(/===JSON_START===[\s\S]*?===JSON_END===/g, "[報價JSON已省略]")}`)
    .join("\n");

  const contextNote = parsedQuote
    ? `\n\n[系統報價JSON]\n${JSON.stringify(parsedQuote)}`
    : "";

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_V2 },
        { role: "user", content: conversationText + contextNote },
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

    const parsedQuote = parseEmbeddedJson(fullContent);
    if (parsedQuote) {
      res.write(`data: ${JSON.stringify({ quoteCard: parsedQuote })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);

    if (isOrderConfirmed(fullContent)) {
      try {
        const allHistory = [...messages, { role: "assistant" as const, content: fullContent }];
        const lastQuote = (() => {
          for (let i = allHistory.length - 1; i >= 0; i--) {
            const q = parseEmbeddedJson(allHistory[i].content);
            if (q) return q;
          }
          return parsedQuote;
        })();

        const extracted = await extractOrderData(openai, allHistory, lastQuote);

        const pickupAddress = String(extracted.pickupAddress ?? lastQuote?.pickup ?? "").trim();
        const deliveryAddress = String(extracted.deliveryAddress ?? lastQuote?.dropoff ?? "").trim();
        const cargoDescription = String(extracted.cargoDescription ?? lastQuote?.cargo ?? "AI接單").trim();
        const customerName = String(extracted.customerName ?? "").trim() || "AI接單客戶";
        const customerPhone = String(extracted.customerPhone ?? "").trim() || "待確認";
        const cargoWeight = typeof extracted.cargoWeight === "number" ? extracted.cargoWeight : null;
        const totalFee = typeof extracted.totalFee === "number" ? extracted.totalFee : (typeof lastQuote?.price === "number" ? lastQuote.price : null);
        const notes = [
          lastQuote?.extras && (lastQuote.extras as string[]).length > 0 ? `附加：${(lastQuote.extras as string[]).join("、")}` : "",
          lastQuote?.time ? `時間：${lastQuote.time}` : "",
          lastQuote?.breakdown ? `計費：${lastQuote.breakdown}` : "",
          String(extracted.notes ?? "").trim(),
        ].filter(Boolean).join(" | ") || null;

        if (pickupAddress && deliveryAddress) {
          const [order] = await db
            .insert(ordersTable)
            .values({
              customerName,
              customerPhone,
              pickupAddress,
              deliveryAddress,
              cargoDescription: cargoDescription || "AI接單",
              cargoWeight,
              totalFee,
              notes: notes ? `[AI接單] ${notes}` : "[AI接單]",
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
