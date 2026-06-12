import { useCallback, useRef, useEffect } from "react";

interface RecordButtonProps {
  /** 是否正在录音 */
  isRecording: boolean;
  /** 按钮是否可用 */
  disabled: boolean;
  /** 按下开始录音 */
  onStart: () => void;
  /** 松开发送 turn.end */
  onStop: () => void;
}

/** 最短按压时间 (ms)：按下后在此时间内 mouseup 被忽略，防止误触 */
const MIN_PRESS_DURATION = 200;

/**
 * 按住说话按钮
 *
 * 支持 mouse 和 touch 事件。按下触发录音，松开触发停止。
 *
 * 关键设计：
 * 1. 使用 document 级 mouseup/touchend 检测松开（而非 onMouseLeave）
 * 2. 最短按压时间保护，防止 React 重渲染时的误触发
 * 3. 通过 ref 访问最新 onStop，避免闭包过期
 */
export function RecordButton({ isRecording, disabled, onStart, onStop }: RecordButtonProps) {
  const isPressedRef = useRef(false);
  const pressStartTimeRef = useRef(0);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    onStopRef.current = onStop;
  });

  // 在 document 级监听 mouseup/touchend，即使鼠标移出按钮也能正确松手
  useEffect(() => {
    const handleUp = (e: MouseEvent | TouchEvent) => {
      if (!isPressedRef.current) return;

      // 最短按压保护：忽略过于快速的 mouseup
      const elapsed = Date.now() - pressStartTimeRef.current;
      if (elapsed < MIN_PRESS_DURATION) {
        console.log("[RecordButton] mouseup 被忽略（按压时间过短）", { elapsed, min: MIN_PRESS_DURATION });
        return;
      }

      e.preventDefault();
      isPressedRef.current = false;
      onStopRef.current();
    };

    document.addEventListener("mouseup", handleUp);
    document.addEventListener("touchend", handleUp);
    return () => {
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("touchend", handleUp);
    };
  }, []);

  const handleDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (disabled || isPressedRef.current) return;
      isPressedRef.current = true;
      pressStartTimeRef.current = Date.now();
      onStart();
    },
    [disabled, onStart],
  );

  if (disabled) {
    return (
      <button
        disabled
        style={{
          width: 80,
          height: 80,
          borderRadius: "var(--radius-full)",
          backgroundColor: "var(--color-bg-input)",
          color: "var(--color-text-muted)",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all var(--transition)",
        }}
      >
        🎙
      </button>
    );
  }

  return (
    <button
      onMouseDown={handleDown}
      onTouchStart={handleDown}
      style={{
        width: 80,
        height: 80,
        borderRadius: "var(--radius-full)",
        backgroundColor: isRecording ? "var(--color-error)" : "var(--color-accent)",
        color: "#fff",
        fontSize: isRecording ? 13 : 28,
        fontWeight: 600,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 150ms ease",
        transform: isRecording ? "scale(1.08)" : "scale(1)",
        boxShadow: isRecording
          ? "0 0 0 6px rgba(239, 68, 68, 0.3)"
          : "0 4px 16px rgba(99, 102, 241, 0.4)",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {isRecording ? "松开发送" : "🎙"}
    </button>
  );
}
