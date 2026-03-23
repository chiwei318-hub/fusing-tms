import { Router, type IRouter } from "express";
import OpenAI from "openai";

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

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
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
