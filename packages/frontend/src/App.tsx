import { useRef, useEffect, useCallback } from "react";
import { AppProvider, useApp } from "./context/AppContext.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { useMicrophone } from "./hooks/useMicrophone.js";
import { useCamera } from "./hooks/useCamera.js";
import { CameraPreview } from "./components/CameraPreview.js";
import { RecordButton } from "./components/RecordButton.js";
import { ChatBubble } from "./components/ChatBubble.js";
import { ThinkingIndicator } from "./components/ThinkingIndicator.js";
import { playAudio } from "./utils/playAudio.js";
import { injectKeyframes } from "./styles/keyframes.js";

// ─── Inner App (有 Context 访问权) ─────────────────────────

function AppInner() {
  const { state, dispatch } = useApp();

  // 同步 ref 给回调访问最新值
  const sessionIdRef = useRef(state.sessionId);
  useEffect(() => {
    sessionIdRef.current = state.sessionId;
  }, [state.sessionId]);

  const phaseRef = useRef(state.sessionPhase);
  useEffect(() => {
    phaseRef.current = state.sessionPhase;
  }, [state.sessionPhase]);

  // 是否正在录音（用于控制帧发送）
  const recordingRef = useRef(false);

  // ── WebSocket（解构以获得稳定引用，避免 ESLint deps 警告）──
  const {
    readyState,
    send,
    on,
    off,
    connect,
    disconnect,
  } = useWebSocket(
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`,
    { autoConnect: false },
  );

  // 连接建立后自动发送 session.start
  useEffect(() => {
    if (readyState === WebSocket.OPEN && state.sessionPhase === "idle") {
      send("session.start", {});
    }
  }, [readyState, state.sessionPhase, send]);

  // ── 麦克风：onChunk 发送 audio.chunk ──
  const mic = useMicrophone({
    chunkSize: 2048,
    onChunk: useCallback(
      (data: string) => {
        const sid = sessionIdRef.current;
        if (sid && recordingRef.current) {
          send("audio.chunk", { sessionId: sid, data });
        }
      },
      [send],
    ),
  });

  // ── 摄像头：onFrame 发送 frame.update ──
  const cam = useCamera({
    interval: 1000,
    onFrame: useCallback(
      (image: string) => {
        const sid = sessionIdRef.current;
        if (sid && recordingRef.current) {
          send("frame.update", { sessionId: sid, image });
        }
      },
      [send],
    ),
  });

  // ── 订阅服务端事件（具名函数 + cleanup 兼容 Strict Mode） ──
  useEffect(() => {
    const onSessionReady = (p: { sessionId: string }) => {
      dispatch({ type: "SESSION_READY", sessionId: p.sessionId });
    };
    const onAsrPartial = (p: { text: string }) => {
      dispatch({ type: "ASR_PARTIAL", text: p.text });
    };
    const onAsrFinal = (p: { text: string }) => {
      dispatch({ type: "ASR_FINAL", text: p.text });
    };
    const onThinking = () => {
      dispatch({ type: "ASSISTANT_THINKING" });
    };
    const onText = (p: { text: string }) => {
      dispatch({ type: "ASSISTANT_TEXT", text: p.text });
    };
    const onAudio = (p: { data: string }) => {
      dispatch({ type: "ASSISTANT_AUDIO" });
      playAudio(
        p.data,
        () => {
          const sid = sessionIdRef.current;
          if (sid) send("playback.done", { sessionId: sid });
          dispatch({ type: "BACK_TO_LISTENING" });
        },
        (err) => dispatch({ type: "SET_ERROR", message: `音频播放失败: ${err.message}` }),
      );
    };
    const onDone = () => {
      dispatch({ type: "ASSISTANT_DONE" });
    };
    const onUsage = (p: {
      sessionId: string;
      asrCalls: number;
      glmCalls: number;
      ttsCalls: number;
      totalTurns: number;
    }) => {
      dispatch({ type: "USAGE_UPDATE", payload: p });
    };
    const onError = (p: { message: string }) => {
      dispatch({ type: "SET_ERROR", message: p.message });
    };

    on("session.ready", onSessionReady);
    on("asr.partial", onAsrPartial);
    on("asr.final", onAsrFinal);
    on("assistant.thinking", onThinking);
    on("assistant.text", onText);
    on("assistant.audio", onAudio);
    on("assistant.done", onDone);
    on("usage.update", onUsage);
    on("error", onError);

    return () => {
      off("session.ready", onSessionReady);
      off("asr.partial", onAsrPartial);
      off("asr.final", onAsrFinal);
      off("assistant.thinking", onThinking);
      off("assistant.text", onText);
      off("assistant.audio", onAudio);
      off("assistant.done", onDone);
      off("usage.update", onUsage);
      off("error", onError);
    };
  }, [on, off, send, dispatch]);

  // ── 按下录音 ──
  const handleStartRecording = useCallback(async () => {
    if (state.sessionPhase !== "listening") return;
    recordingRef.current = true;
    try {
      await Promise.all([mic.start(), cam.start()]);
    } catch {
      // mic/cam 内部已处理错误
    }
  }, [state.sessionPhase, mic.start, cam.start]);

  // ── 松开录音 ──
  const handleStopRecording = useCallback(() => {
    recordingRef.current = false;
    mic.stop();
    cam.stop();
    const sid = sessionIdRef.current;
    if (sid) send("turn.end", { sessionId: sid });
  }, [mic.stop, cam.stop, send]);

  // ── 开始会话 ──
  const handleStartSession = useCallback(() => {
    connect();
  }, [connect]);

  // ── 结束会话 ──
  const handleStopSession = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) send("session.stop", { sessionId: sid });
    mic.stop();
    cam.stop();
    disconnect();
    dispatch({ type: "SESSION_STOP" });
  }, [mic.stop, cam.stop, send, disconnect, dispatch]);

  // ── 注入 CSS keyframes ──
  useEffect(() => {
    injectKeyframes();
  }, []);

  // ── 阶段助读 ──
  const phaseLabel: Record<string, string> = {
    idle: "点击下方按钮开始会话",
    connecting: "连接中...",
    listening: state.messages.length === 0 ? "按住按钮开始说话" : "继续说话...",
    transcribing: "识别中...",
    thinking: "AI 思考中...",
    speaking: "AI 回复中...",
  };

  const canRecord = state.sessionPhase === "listening";
  const showThinking = state.sessionPhase === "transcribing" || state.sessionPhase === "thinking";

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "16px 20px",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system, sans-serif",
      }}
    >
      {/* ── 顶部状态栏 ── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 0",
          marginBottom: 8,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>AI 视觉对话助手</h1>
        {state.sessionPhase !== "idle" && (
          <button
            onClick={handleStopSession}
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              padding: "4px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
            }}
          >
            结束会话
          </button>
        )}
      </header>

      {/* ── 摄像头预览 ── */}
      <div style={{ marginBottom: 12 }}>
        <CameraPreview stream={cam.stream} />
      </div>

      {/* ── 阶段提示 ── */}
      <div
        style={{
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: 13,
          marginBottom: 8,
          minHeight: 20,
        }}
      >
        {phaseLabel[state.sessionPhase] ?? ""}
      </div>

      {/* ── 对话区域 ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 0",
          marginBottom: 12,
        }}
      >
        {state.messages.length === 0 && state.sessionPhase === "idle" && (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 14, marginTop: 40 }}>
            连接后端服务，开启 AI 视觉对话
          </p>
        )}

        {state.messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        <ThinkingIndicator visible={showThinking} />

        {/* ASR 实时识别文本 */}
        {state.asrPartial && (
          <div
            style={{
              textAlign: "right",
              marginBottom: 12,
              padding: "6px 14px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-bg-card)",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            {state.asrPartial}
          </div>
        )}
      </div>

      {/* ── 错误提示 ── */}
      {state.error && (
        <div
          style={{
            padding: "8px 14px",
            marginBottom: 8,
            borderRadius: "var(--radius-sm)",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            color: "var(--color-error)",
            fontSize: 13,
          }}
        >
          {state.error}
          <button
            onClick={() => dispatch({ type: "CLEAR_ERROR" })}
            style={{ marginLeft: 8, color: "var(--color-error)", fontSize: 16, verticalAlign: "middle" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 底部操作区 ── */}
      <footer
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "12px 0 20px",
          gap: 16,
        }}
      >
        {state.sessionPhase === "idle" ? (
          <button
            onClick={handleStartSession}
            disabled={readyState === WebSocket.CONNECTING}
            style={{
              padding: "12px 32px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-accent)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)",
              transition: "all var(--transition)",
            }}
          >
            {readyState === WebSocket.CONNECTING ? "连接中..." : "开始会话"}
          </button>
        ) : (
          <RecordButton
            isRecording={mic.isRecording}
            disabled={!canRecord}
            onStart={handleStartRecording}
            onStop={handleStopRecording}
          />
        )}
      </footer>

      {/* ── 用量统计 ── */}
      {state.usage && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 20,
            padding: "8px 0 12px",
            fontSize: 11,
            color: "var(--color-text-muted)",
          }}
        >
          <span>轮次: {state.usage.totalTurns}</span>
          <span>ASR: {state.usage.asrCalls}</span>
          <span>GLM: {state.usage.glmCalls}</span>
          <span>TTS: {state.usage.ttsCalls}</span>
        </div>
      )}
    </main>
  );
}

// ─── Outer App（Provider 包裹） ──────────────────────────────

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
