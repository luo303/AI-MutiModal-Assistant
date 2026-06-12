/**
 * WebSocket 协议事件类型定义
 *
 * 客户端 → 服务端：6 个事件
 * 服务端 → 客户端：9 个事件
 */

// ─── 客户端发送事件 ───────────────────────────────────

export interface SessionStartPayload {
  sessionId?: string; // 可选，服务端可自动生成
}

export interface AudioChunkPayload {
  sessionId: string;
  data: string; // base64 编码的音频数据
}

export interface FrameUpdatePayload {
  sessionId: string;
  image: string; // base64 编码的 JPEG 图片
}

export interface TurnEndPayload {
  sessionId: string;
}

export interface PlaybackDonePayload {
  sessionId: string;
}

export interface SessionStopPayload {
  sessionId: string;
}

export type ClientEventMap = {
  "session.start": SessionStartPayload;
  "audio.chunk": AudioChunkPayload;
  "frame.update": FrameUpdatePayload;
  "turn.end": TurnEndPayload;
  "playback.done": PlaybackDonePayload;
  "session.stop": SessionStopPayload;
};

export type ClientEventType = keyof ClientEventMap;

export interface ClientEvent<T extends ClientEventType = ClientEventType> {
  type: T;
  payload: ClientEventMap[T];
}

// ─── 服务端返回事件 ───────────────────────────────────

export interface SessionReadyPayload {
  sessionId: string;
}

export interface AsrPartialPayload {
  sessionId: string;
  text: string; // 临时识别结果
}

export interface AsrFinalPayload {
  sessionId: string;
  text: string; // 最终识别文本
}

export interface AssistantThinkingPayload {
  sessionId: string;
}

export interface AssistantTextPayload {
  sessionId: string;
  text: string;
}

export interface AssistantAudioPayload {
  sessionId: string;
  data: string; // base64 编码的音频数据
  format?: string; // 音频格式，如 "mp3" | "wav"
}

export interface AssistantDonePayload {
  sessionId: string;
}

export interface UsageUpdatePayload {
  sessionId: string;
  asrCalls: number;
  glmCalls: number;
  ttsCalls: number;
  totalTurns: number;
}

export interface ErrorPayload {
  sessionId?: string;
  code: string;
  message: string;
}

export type ServerEventMap = {
  "session.ready": SessionReadyPayload;
  "asr.partial": AsrPartialPayload;
  "asr.final": AsrFinalPayload;
  "assistant.thinking": AssistantThinkingPayload;
  "assistant.text": AssistantTextPayload;
  "assistant.audio": AssistantAudioPayload;
  "assistant.done": AssistantDonePayload;
  "usage.update": UsageUpdatePayload;
  error: ErrorPayload;
};

export type ServerEventType = keyof ServerEventMap;

export interface ServerEvent<T extends ServerEventType = ServerEventType> {
  type: T;
  payload: ServerEventMap[T];
}
