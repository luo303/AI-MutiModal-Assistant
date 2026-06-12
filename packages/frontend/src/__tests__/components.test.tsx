import { describe, it, expect, vi } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";
import {
  AppProvider,
  useApp,
} from "../context/AppContext.js";
import { ChatBubble } from "../components/ChatBubble.js";
import { ThinkingIndicator } from "../components/ThinkingIndicator.js";
import { CameraPreview } from "../components/CameraPreview.js";
import type { Message } from "../context/AppContext.js";

// ─── Helpers ──────────────────────────────────────────────

/** 创建一个模拟 MediaStream */
function mockStream(): MediaStream {
  return {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    getAudioTracks: vi.fn(() => []),
    getVideoTracks: vi.fn(() => []),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    active: true,
    id: "mock-stream",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaStream;
}

// ─── AppContext Reducer Tests ──────────────────────────────

describe("AppContext reducer", () => {
  it("SESSION_READY → 设置 sessionId + 切换到 listening", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => {
      result.current.dispatch({ type: "SESSION_READY", sessionId: "s1" });
    });
    expect(result.current.state.sessionId).toBe("s1");
    expect(result.current.state.sessionPhase).toBe("listening");
    expect(result.current.state.connectionState).toBe("connected");
  });

  it("TURN_END_SENT → 切到 transcribing（等待 ASR 结果）", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => result.current.dispatch({ type: "SESSION_READY", sessionId: "s1" }));
    act(() => result.current.dispatch({ type: "TURN_END_SENT" }));
    expect(result.current.state.sessionPhase).toBe("transcribing");
  });

  it("ASR_PARTIAL → 更新部分识别文本 + 切到 transcribing", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => {
      result.current.dispatch({ type: "ASR_PARTIAL", text: "今天" });
    });
    expect(result.current.state.asrPartial).toBe("今天");
    expect(result.current.state.sessionPhase).toBe("transcribing");
  });

  it("ASR_FINAL → 添加用户消息 + 切到 thinking", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => {
      result.current.dispatch({ type: "ASR_PARTIAL", text: "今天天气" });
    });
    act(() => {
      result.current.dispatch({ type: "ASR_FINAL", text: "今天天气怎么样" });
    });
    expect(result.current.state.asrPartial).toBe("");
    expect(result.current.state.messages).toHaveLength(1);
    expect(result.current.state.messages[0].role).toBe("user");
    expect(result.current.state.messages[0].text).toBe("今天天气怎么样");
    expect(result.current.state.sessionPhase).toBe("thinking");
  });

  it("ASR_FINAL 无文本时使用 partial 兜底", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => {
      result.current.dispatch({ type: "ASR_PARTIAL", text: "嗯" });
    });
    act(() => {
      result.current.dispatch({ type: "ASR_FINAL", text: "" });
    });
    expect(result.current.state.messages[0].text).toBe("嗯");
  });

  it("ASSISTANT_THINKING → 切换到 thinking", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    // 先进入 thinking（通过 ASR_FINAL）
    act(() => result.current.dispatch({ type: "ASR_FINAL", text: "hi" }));
    act(() => result.current.dispatch({ type: "ASSISTANT_TEXT", text: "你好" }));
    act(() => result.current.dispatch({ type: "ASSISTANT_THINKING" }));
    expect(result.current.state.sessionPhase).toBe("thinking");
  });

  it("ASSISTANT_TEXT → 新增或追加 assistant 消息", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => result.current.dispatch({ type: "ASR_FINAL", text: "hi" }));

    // 第一条 text
    act(() => result.current.dispatch({ type: "ASSISTANT_TEXT", text: "你好" }));
    expect(result.current.state.messages).toHaveLength(2);
    expect(result.current.state.messages[1].role).toBe("assistant");
    expect(result.current.state.messages[1].text).toBe("你好");

    // 追加 text（流式场景）
    act(() => result.current.dispatch({ type: "ASSISTANT_TEXT", text: "，世界" }));
    expect(result.current.state.messages).toHaveLength(2);
    expect(result.current.state.messages[1].text).toBe("你好，世界");
  });

  it("ASSISTANT_AUDIO → 切换到 speaking", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => result.current.dispatch({ type: "ASR_FINAL", text: "hi" }));
    act(() => result.current.dispatch({ type: "ASSISTANT_AUDIO" }));
    expect(result.current.state.sessionPhase).toBe("speaking");
  });

  it("USAGE_UPDATE → 更新用量", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    const payload = {
      sessionId: "s1",
      asrCalls: 3,
      glmCalls: 2,
      ttsCalls: 2,
      totalTurns: 5,
    };
    act(() => result.current.dispatch({ type: "USAGE_UPDATE", payload }));
    expect(result.current.state.usage).toEqual(payload);
  });

  it("BACK_TO_LISTENING → 回到 listening", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => result.current.dispatch({ type: "ASR_FINAL", text: "hi" }));
    act(() => result.current.dispatch({ type: "ASSISTANT_AUDIO" }));
    act(() => result.current.dispatch({ type: "BACK_TO_LISTENING" }));
    expect(result.current.state.sessionPhase).toBe("listening");
  });

  it("SET_ERROR / CLEAR_ERROR → 设置和清除错误", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => result.current.dispatch({ type: "SET_ERROR", message: "出错了" }));
    expect(result.current.state.error).toBe("出错了");
    act(() => result.current.dispatch({ type: "CLEAR_ERROR" }));
    expect(result.current.state.error).toBeNull();
  });

  it("SESSION_STOP → 重置为初始状态", () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    act(() => result.current.dispatch({ type: "SESSION_READY", sessionId: "s1" }));
    act(() => result.current.dispatch({ type: "ASR_FINAL", text: "hi" }));
    act(() => result.current.dispatch({ type: "ASSISTANT_TEXT", text: "ok" }));
    act(() => result.current.dispatch({ type: "SESSION_STOP" }));
    expect(result.current.state).toEqual({
      sessionId: null,
      sessionPhase: "idle",
      connectionState: "disconnected",
      asrPartial: "",
      messages: [],
      usage: null,
      error: null,
    });
  });

  it("useApp 在 Provider 外调用时抛出", () => {
    expect(() => renderHook(() => useApp())).toThrow("useApp must be used within AppProvider");
  });
});

// ─── ChatBubble Tests ─────────────────────────────────────

describe("ChatBubble", () => {
  it("渲染用户消息（右对齐）", () => {
    const msg: Message = { id: "1", role: "user", text: "你好" };
    render(<ChatBubble message={msg} />);
    expect(screen.getByText("你好")).toBeDefined();
  });

  it("渲染 AI 消息（左对齐）", () => {
    const msg: Message = { id: "2", role: "assistant", text: "你好，有什么可以帮你？" };
    render(<ChatBubble message={msg} />);
    expect(screen.getByText("你好，有什么可以帮你？")).toBeDefined();
  });
});

// ─── ThinkingIndicator Tests ──────────────────────────────

describe("ThinkingIndicator", () => {
  it("visible=true 时渲染", () => {
    const { container } = render(<ThinkingIndicator visible={true} />);
    expect(container.textContent).toContain("AI 思考中");
  });

  it("visible=false 时不渲染", () => {
    const { container } = render(<ThinkingIndicator visible={false} />);
    expect(container.textContent).toBe("");
  });
});

// ─── CameraPreview Tests ──────────────────────────────────

describe("CameraPreview", () => {
  it("无 stream 时显示占位符", () => {
    render(<CameraPreview stream={null} />);
    expect(screen.getByText("📷 摄像头未开启")).toBeDefined();
  });

  it("有 stream 时渲染 video 元素", () => {
    const stream = mockStream();
    render(<CameraPreview stream={stream} />);
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
  });
});
