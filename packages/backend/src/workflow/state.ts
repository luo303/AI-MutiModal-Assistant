import { Annotation } from "@langchain/langgraph";

/**
 * AI 视觉助手 MVP 工作流共享状态
 *
 * 使用 LangGraph Annotation.Root() 定义 9 个状态字段。
 * 不加 reducer 的字段默认为 LastValue（覆盖式更新）。
 */
export const WorkflowState = Annotation.Root({
  // ── 输入 ──────────────────────────────────────────
  sessionId: Annotation<string>(),
  userText: Annotation<string>(),
  /** 最新摄像头帧（base64 string，可选） */
  latestFrameBase64: Annotation<string | undefined>(),

  // ── 中间结果 ──────────────────────────────────────
  /** GLM 返回的 AI 文本 */
  assistantText: Annotation<string | undefined>(),
  /** TTS 返回的音频 Buffer */
  assistantAudio: Annotation<Buffer | undefined>(),

  // ── 错误 ──────────────────────────────────────────
  error: Annotation<string | undefined>(),

  // ── 用量计数 ──────────────────────────────────────
  asrCalls: Annotation<number>({ default: () => 0, reducer: (_prev, next) => next }),
  glmCalls: Annotation<number>({ default: () => 0, reducer: (_prev, next) => next }),
  ttsCalls: Annotation<number>({ default: () => 0, reducer: (_prev, next) => next }),
});

export type WorkflowStateType = typeof WorkflowState.State;
export type WorkflowUpdateType = typeof WorkflowState.Update;
