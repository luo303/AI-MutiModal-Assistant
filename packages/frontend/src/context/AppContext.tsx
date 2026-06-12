import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type { UsageUpdatePayload } from "../types/events.js";

// ─── Types ──────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** 会话阶段（对应后端状态机 + 纯前端状态） */
export type SessionPhase =
  | "idle"          // 未连接
  | "connecting"    // 等待 session.ready
  | "listening"     // 等待用户说话（可录音）
  | "transcribing"  // ASR 识别中
  | "thinking"      // AI 思考中
  | "speaking";     // AI 语音播放中

export interface AppState {
  sessionId: string | null;
  sessionPhase: SessionPhase;
  connectionState: "disconnected" | "connected";
  asrPartial: string;
  messages: Message[];
  usage: UsageUpdatePayload | null;
  error: string | null;
}

// ─── Actions ─────────────────────────────────────────────

export type AppAction =
  | { type: "SESSION_READY"; sessionId: string }
  | { type: "ASR_PARTIAL"; text: string }
  | { type: "ASR_FINAL"; text: string }
  | { type: "ASSISTANT_THINKING" }
  | { type: "ASSISTANT_TEXT"; text: string }
  | { type: "ASSISTANT_AUDIO" }
  | { type: "ASSISTANT_DONE" }
  | { type: "USAGE_UPDATE"; payload: UsageUpdatePayload }
  | { type: "SET_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "BACK_TO_LISTENING" }
  | { type: "SESSION_STOP" };

// ─── Initial State ───────────────────────────────────────

const initialState: AppState = {
  sessionId: null,
  sessionPhase: "idle",
  connectionState: "disconnected",
  asrPartial: "",
  messages: [],
  usage: null,
  error: null,
};

// ─── Reducer ─────────────────────────────────────────────

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SESSION_READY":
      return {
        ...state,
        sessionId: action.sessionId,
        sessionPhase: "listening",
        connectionState: "connected",
        asrPartial: "",
        error: null,
      };

    case "ASR_PARTIAL":
      return {
        ...state,
        asrPartial: action.text,
        sessionPhase: "transcribing",
      };

    case "ASR_FINAL": {
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        text: action.text || state.asrPartial || "(无文字)",
      };
      return {
        ...state,
        asrPartial: "",
        messages: [...state.messages, userMsg],
        sessionPhase: "thinking",
      };
    }

    case "ASSISTANT_THINKING":
      return { ...state, sessionPhase: "thinking" };

    case "ASSISTANT_TEXT": {
      // 在消息列表末尾追加/更新 assistant 消息
      const last = state.messages[state.messages.length - 1];
      if (last?.role === "assistant") {
        // 追加文本（流式场景，实际 MVP 是单条）
        return {
          ...state,
          messages: [
            ...state.messages.slice(0, -1),
            { ...last, text: last.text + action.text },
          ],
        };
      }
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `a-${Date.now()}`, role: "assistant", text: action.text },
        ],
      };
    }

    case "ASSISTANT_AUDIO":
      return { ...state, sessionPhase: "speaking" };

    case "ASSISTANT_DONE":
      // 保持在 speaking 直到 audio 播完
      return state;

    case "USAGE_UPDATE":
      return { ...state, usage: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.message };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "BACK_TO_LISTENING":
      return { ...state, sessionPhase: "listening", error: null };

    case "SESSION_STOP":
      return { ...initialState };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
