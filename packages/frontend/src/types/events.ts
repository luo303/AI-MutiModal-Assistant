/**
 * WebSocket 协议事件类型定义（与服务端 types/events.ts 保持一致）
 *
 * 客户端 → 服务端：6 个事件
 * 服务端 → 客户端：9 个事件
 */

// ─── 客户端发送事件 ───────────────────────────────────

export interface SessionStartPayload {
  sessionId?: string;
}

export interface AudioChunkPayload {
  sessionId: string;
  data: string; // base64 PCM 16kHz 16bit mono
}

export interface FrameUpdatePayload {
  sessionId: string;
  image: string; // base64 JPEG
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
  text: string;
}

export interface AsrFinalPayload {
  sessionId: string;
  text: string;
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
  data: string; // base64 MP3
  format?: string;
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
