import { randomUUID } from "node:crypto";
import { Session, SessionState } from "../types/session.js";
import { sessionStore } from "./sessionStore.js";
import { transition, canAcceptAudio } from "./sessionStateMachine.js";

import { logger } from "../lib/logger.js";

const MODULE = "sessionManager";

export const sessionManager = {
  /** 创建新会话，状态从 idle → listening */
  createSession(id?: string): Session {
    const sessionId = id ?? randomUUID();
    const session: Session = {
      id: sessionId,
      state: SessionState.Idle,
      createdAt: new Date(),
    };
    sessionStore.create(session);
    session.state = transition(SessionState.Idle, "start");
    logger.info(MODULE, `Session created`, { sessionId, state: session.state });
    return session;
  },

  /** 获取会话，不存在则抛错 */
  getSession(id: string): Session {
    return sessionStore.getOrThrow(id);
  },

  /** 保存当前摄像头截图 */
  setLatestFrame(id: string, frameBase64: string): void {
    const session = sessionStore.getOrThrow(id);
    session.latestFrame = frameBase64;
  },

  /** 获取当前帧 */
  getLatestFrame(id: string): string | undefined {
    return sessionStore.get(id)?.latestFrame;
  },

  /** turn.end → transcribing */
  recordTurnEnd(id: string): void {
    const session = sessionStore.getOrThrow(id);
    session.state = transition(session.state, "turnEnd");
    logger.info(MODULE, `Turn ended, transcribing`, { sessionId: id });
  },

  /** ASR final → thinking */
  recordAsrFinal(id: string, userText: string): void {
    const session = sessionStore.getOrThrow(id);
    session.currentUserText = userText;
    session.state = transition(session.state, "asrFinal");
    logger.info(MODULE, `ASR final, thinking`, { sessionId: id, userText });
  },

  /** assistant.audio → speaking */
  recordAssistantAudio(id: string): void {
    const session = sessionStore.getOrThrow(id);
    session.state = transition(session.state, "assistantAudio");
    logger.info(MODULE, `Assistant audio ready, speaking`, { sessionId: id });
  },

  /** playback.done → listening */
  recordPlaybackDone(id: string): void {
    const session = sessionStore.getOrThrow(id);
    session.state = transition(session.state, "playbackDone");
    logger.info(MODULE, `Playback done, listening`, { sessionId: id });
  },

  /** stop → closed */
  closeSession(id: string): void {
    const session = sessionStore.get(id);
    if (!session) return;
    session.state = transition(session.state, "stop");
    sessionStore.delete(id);
    logger.info(MODULE, `Session closed`, { sessionId: id });
  },

  /** 检查是否可以接受音频：仅 listening 状态 */
  canAcceptAudio(id: string): boolean {
    const session = sessionStore.get(id);
    if (!session) return false;
    return canAcceptAudio(session.state);
  },

  /** 获取当前状态 */
  getState(id: string): SessionState | undefined {
    return sessionStore.get(id)?.state;
  },
};
