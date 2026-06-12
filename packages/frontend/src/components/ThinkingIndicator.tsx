import { keyframes } from "../styles/keyframes.js";

interface ThinkingIndicatorProps {
  visible: boolean;
}

/**
 * AI 思考中动画指示器 — 三个跳动的圆点
 */
export function ThinkingIndicator({ visible }: ThinkingIndicatorProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        marginBottom: 12,
      }}
    >
      <span style={{ color: "var(--color-text-secondary)", fontSize: 13, marginRight: 4 }}>
        AI 思考中
      </span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "var(--color-accent)",
            animation: `${keyframes.dotPulse} 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
