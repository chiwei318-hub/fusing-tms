import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, RotateCcw, Truck, CheckCircle2, ExternalLink, MapPin, Package, Clock, Zap, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface QuoteCard {
  pickup: string;
  dropoff: string;
  truck: string;
  cargo: string;
  time?: string;
  distance_km: number;
  base: number;
  extras: string[];
  extras_fee: number;
  price: number;
  breakdown: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  quoteCard?: QuoteCard;
}

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

const WELCOME: Message = {
  role: "assistant",
  content: "您好！我是富詠運輸 AI 接單系統 🚚\n\n**一句話就能完成報價和下單**，直接說明您的需求即可，例如：\n\n「明天台北到台中，5噸車，搬家具，需要搬運」",
};

const EXTRA_ICONS: Record<string, string> = {
  "尾門": "🔧",
  "搬運": "💪",
  "冷鏈": "❄️",
  "急件": "⚡",
};

function stripJsonBlock(text: string): string {
  return text
    .replace(/===JSON_START===[\s\S]*?===JSON_END===/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderContent(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={i > 0 ? "mt-1" : ""}>
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            part
          )
        )}
      </p>
    );
  });
}

function QuoteCardUI({ card, onConfirm }: { card: QuoteCard; onConfirm: () => void }) {
  return (
    <div className="mx-0 rounded-2xl overflow-hidden border-2 border-emerald-200 bg-white shadow-md">
      {/* Header */}
      <div className="bg-emerald-500 px-4 py-3 flex items-center gap-2">
        <Truck className="w-4 h-4 text-white" />
        <span className="text-white font-bold text-sm">即時報價單</span>
        <span className="ml-auto text-emerald-100 font-black text-lg">
          NT${card.price.toLocaleString()}
        </span>
      </div>

      {/* Route */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <div className="w-0.5 h-4 bg-slate-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-semibold text-slate-700 truncate">{card.pickup}</span>
            <span className="font-semibold text-slate-700 truncate">{card.dropoff}</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground shrink-0">
            {card.distance_km} km
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <div className="bg-slate-50 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
            <Truck className="w-3 h-3" /> 車型
          </div>
          <div className="text-sm font-bold text-slate-800">{card.truck}</div>
        </div>
        <div className="bg-slate-50 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
            <Package className="w-3 h-3" /> 貨物
          </div>
          <div className="text-sm font-semibold text-slate-800 truncate">{card.cargo}</div>
        </div>
        {card.time && (
          <div className="bg-slate-50 rounded-xl px-3 py-2 col-span-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
              <Clock className="w-3 h-3" /> 時間
            </div>
            <div className="text-sm font-semibold text-slate-800">{card.time}</div>
          </div>
        )}
      </div>

      {/* Extras */}
      {card.extras && card.extras.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {card.extras.map(e => (
              <span key={e} className="flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full font-medium">
                {EXTRA_ICONS[e] ?? "+"} {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="px-4 pb-3">
        <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-xs text-slate-500 font-mono">
          {card.breakdown}
        </div>
      </div>

      {/* Price total */}
      <div className="border-t px-4 py-3 flex items-center justify-between bg-emerald-50">
        <div>
          <div className="text-xs text-emerald-700 font-medium">總報價</div>
          <div className="text-2xl font-black text-emerald-700">NT${card.price.toLocaleString()}</div>
        </div>
        <button
          onClick={onConfirm}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-sm px-5 py-3 rounded-xl transition-all shadow-sm"
        >
          確認派車 <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, onConfirmQuote }: { msg: Message; onConfirmQuote?: () => void }) {
  const isUser = msg.role === "user";
  const displayContent = stripJsonBlock(msg.content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? "bg-blue-500" : "bg-emerald-500"}`}>
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div className="flex flex-col gap-2 max-w-[82%]">
        {displayContent && (
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? "bg-blue-500 text-white rounded-tr-sm" : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm"}`}>
            {msg.streaming && msg.content === "" ? (
              <span className="flex gap-1 items-center py-0.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            ) : (
              renderContent(displayContent)
            )}
          </div>
        )}

        {msg.quoteCard && onConfirmQuote && (
          <QuoteCardUI card={msg.quoteCard} onConfirm={onConfirmQuote} />
        )}
      </div>
    </div>
  );
}

function OrderCreatedBanner({ orderId }: { orderId: number }) {
  return (
    <div className="mx-2 bg-green-50 border-2 border-green-200 rounded-2xl px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
        <div>
          <p className="font-bold text-green-800 text-sm">訂單已建立 #{orderId}</p>
          <p className="text-green-600 text-xs mt-0.5">已進入派車待處理列表，調度員將盡快安排</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href="/orders">
          <button className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
            查看訂單列表
          </button>
        </Link>
        <Link href={`/orders/${orderId}`}>
          <button className="flex items-center gap-1.5 bg-white border border-green-300 hover:bg-green-50 text-green-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
            訂單詳情 #{orderId}
          </button>
        </Link>
      </div>
    </div>
  );
}

const QUICK_SUGGESTIONS = [
  "台北到台中，5噸車，搬辦公室家具，需要搬運",
  "桃園到高雄，明天下午，3.5T，電器設備",
  "台北市區到新北，今天急件，3.5T，小型貨物，需要尾門",
  "台中到台南，冷鏈食品，5T，明天早上",
];

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [lastQuoteCard, setLastQuoteCard] = useState<QuoteCard | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, createdOrderId]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setInput("");
    setLoading(true);

    const assistantIdx = updatedMsgs.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const history = updatedMsgs.map(({ role, content }) => ({ role, content }));

      const resp = await fetch(`${BASE_URL}/api/ai-chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok || !resp.body) throw new Error("Network error");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let currentQuoteCard: QuoteCard | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullContent += data.content;
              setMessages((prev) => {
                const next = [...prev];
                next[assistantIdx] = { role: "assistant", content: fullContent, streaming: true };
                return next;
              });
            }
            if (data.quoteCard) {
              currentQuoteCard = data.quoteCard as QuoteCard;
              setLastQuoteCard(currentQuoteCard);
              setMessages((prev) => {
                const next = [...prev];
                next[assistantIdx] = { role: "assistant", content: fullContent, streaming: true, quoteCard: currentQuoteCard! };
                return next;
              });
            }
            if (data.done) {
              setMessages((prev) => {
                const next = [...prev];
                next[assistantIdx] = { role: "assistant", content: fullContent, streaming: false, quoteCard: currentQuoteCard ?? undefined };
                return next;
              });
            }
            if (data.orderCreated && data.orderId) {
              setCreatedOrderId(data.orderId);
              setLastQuoteCard(null);
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[assistantIdx] = { role: "assistant", content: "抱歉，系統發生錯誤，請稍後再試。", streaming: false };
        return next;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages]);

  const handleConfirmQuote = useCallback(() => {
    sendMessage("確認派車");
  }, [sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([WELCOME]);
    setInput("");
    setCreatedOrderId(null);
    setLastQuoteCard(null);
    inputRef.current?.focus();
  };

  const showSuggestions = messages.length <= 1 && !loading;
  const hasQuote = lastQuoteCard !== null;

  return (
    <div className="flex flex-col h-dvh bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
          <Truck className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-slate-800">富詠運輸 AI 接單</div>
          <div className="text-xs text-emerald-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            一句話完成下單
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600" onClick={resetChat} title="重新開始">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-600 text-center flex items-center justify-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-500" />
          一句話說明需求，AI 立即解析報價，最快 1 分鐘完成接單
        </div>

        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            onConfirmQuote={msg.quoteCard ? handleConfirmQuote : undefined}
          />
        ))}

        {createdOrderId && <OrderCreatedBanner orderId={createdOrderId} />}

        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions (first screen only) */}
      {showSuggestions && (
        <div className="px-4 pb-2 space-y-1.5">
          <p className="text-xs text-slate-400 font-medium px-1">💡 快速範例（點擊填入）</p>
          <div className="space-y-1.5">
            {QUICK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="w-full text-left bg-white border border-slate-200 text-slate-600 text-xs px-3 py-2 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* After quote: quick confirm button */}
      {hasQuote && !loading && !createdOrderId && (
        <div className="px-4 pb-2 flex gap-2">
          <button
            onClick={handleConfirmQuote}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm py-3 rounded-xl transition-colors active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" /> 確認派車
          </button>
          <button
            onClick={() => { setInput("我需要修改一下需求"); inputRef.current?.focus(); }}
            className="px-4 py-3 border rounded-xl text-slate-500 text-sm hover:bg-muted transition-colors"
          >
            修改
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-slate-100 px-4 py-3 safe-area-bottom">
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="說明您的運輸需求（起點、終點、貨物、時間...）"
            disabled={loading}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-center text-xs text-slate-300 mt-2">富詠運輸股份有限公司 · AI 全自動接單系統</p>
      </div>
    </div>
  );
}
