import type { Message } from "../context/AppContext.js";

interface ChatBubbleProps {
  message: Message;
}

/**
 * 对话气泡 — 用户消息靠右（蓝色），AI 消息靠左（深色）
 */
export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: isUser
            ? "var(--radius-md) var(--radius-md) 4px var(--radius-md)"
            : "var(--radius-md) var(--radius-md) var(--radius-md) 4px",
          backgroundColor: isUser ? "var(--color-user-bubble)" : "var(--color-ai-bubble)",
          color: "var(--color-text-primary)",
          fontSize: 14,
          lineHeight: 1.6,
          wordBreak: "break-word",
        }}
      >
        {message.text}
      </div>
    </div>
  );
}
