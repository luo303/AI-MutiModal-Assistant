import { useCallback, useRef } from "react";

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

/**
 * 按住说话按钮
 *
 * 支持 mouse 和 touch 事件。按下触发录音，松开触发停止。
 * 录音时显示脉冲动画 + "松开发送" 提示。
 */
export function RecordButton({ isRecording, disabled, onStart, onStop }: RecordButtonProps) {
  const isPressedRef = useRef(false);

  const handleDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (disabled || isPressedRef.current) return;
      isPressedRef.current = true;
      onStart();
    },
    [disabled, onStart],
  );

  const handleUp = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isPressedRef.current) return;
      isPressedRef.current = false;
      onStop();
    },
    [onStop],
  );

  // 防止鼠标离开按钮后松开导致状态不一致
  const handleLeave = useCallback(() => {
    if (isPressedRef.current) {
      isPressedRef.current = false;
      onStop();
    }
  }, [onStop]);

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
      onMouseUp={handleUp}
      onMouseLeave={handleLeave}
      onTouchStart={handleDown}
      onTouchEnd={handleUp}
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
