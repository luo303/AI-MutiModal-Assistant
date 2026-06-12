/**
 * 半双工会话状态机类型定义
 *
 * idle → listening → transcribing → thinking → speaking → listening (循环)
 * 任意状态 → closed (终止)
 */

export enum SessionState {
  Idle = "idle",
  Listening = "listening",
  Transcribing = "transcribing",
  Thinking = "thinking",
  Speaking = "speaking",
  Closed = "closed",
}

/** 触发状态转移的事件 */
export type TransitionEvent = "start" | "turnEnd" | "asrFinal" | "assistantAudio" | "playbackDone" | "stop";

export interface Session {
  id: string;
  state: SessionState;
  createdAt: Date;
  /** 当前会话最近一张摄像头截图 (base64) */
  latestFrame?: string;
  /** 本轮用户语音识别文本 */
  currentUserText?: string;
}
