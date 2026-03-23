import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, RotateCcw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

const WELCOME: Message = {
  role: "assistant",
  content: "您好！我是富詠運輸AI客服 🚚\n\n我可以幫您快速完成報價與下單。請問您的貨物**起運地**在哪裡？",
};

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  const renderContent = (text: string) => {
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
  };

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-blue-500" : "bg-emerald-500"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>
      <div
        className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-blue-500 text-white rounded-tr-sm"
            : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm"
        }`}
      >
        {msg.streaming && msg.content === "" ? (
          <span className="flex gap-1 items-center py-0.5">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </span>
        ) : (
          renderContent(msg.content)
        )}
      </div>
    </div>
  );
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
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
            if (data.done) {
              setMessages((prev) => {
                const next = [...prev];
                next[assistantIdx] = { role: "assistant", content: fullContent, streaming: false };
                return next;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[assistantIdx] = {
          role: "assistant",
          content: "抱歉，系統發生錯誤，請稍後再試。",
          streaming: false,
        };
        return next;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([WELCOME]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-dvh bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
          <Truck className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-slate-800">富詠運輸 AI 客服</div>
          <div className="text-xs text-emerald-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            線上中
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-600"
          onClick={resetChat}
          title="重新開始"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Tip banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-600 text-center">
          💬 AI 客服將依序詢問，收集完資料後自動報價
        </div>

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies for common inputs */}
      {messages.length <= 2 && !loading && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {["台北市", "新北市", "桃園市", "台中市", "高雄市"].map((city) => (
            <button
              key={city}
              className="bg-white border border-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-full hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              onClick={() => {
                setInput(city);
                inputRef.current?.focus();
              }}
            >
              {city}
            </button>
          ))}
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
            placeholder="輸入訊息..."
            disabled={loading}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-center text-xs text-slate-300 mt-2">
          富詠運輸股份有限公司 · AI 客服系統
        </p>
      </div>
    </div>
  );
}
