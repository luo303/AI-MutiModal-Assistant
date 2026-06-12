import { SessionState, TransitionEvent } from "../types/session.js";
import { SessionError } from "../lib/errors.js";

/**
 * 半双工状态转移矩阵
 *
 * idle      → listening  (start)
 * listening → transcribing (turnEnd)
 * transcribing → thinking (asrFinal)
 * thinking  → speaking   (assistantAudio)
 * speaking  → listening  (playbackDone)
 * any       → closed     (stop)
 */
const VALID_TRANSITIONS: Record<SessionState, Partial<Record<TransitionEvent, SessionState>>> = {
  [SessionState.Idle]: {
    start: SessionState.Listening,
    stop: SessionState.Closed,
  },
  [SessionState.Listening]: {
    turnEnd: SessionState.Transcribing,
    stop: SessionState.Closed,
  },
  [SessionState.Transcribing]: {
    asrFinal: SessionState.Thinking,
    stop: SessionState.Closed,
  },
  [SessionState.Thinking]: {
    assistantAudio: SessionState.Speaking,
    stop: SessionState.Closed,
  },
  [SessionState.Speaking]: {
    playbackDone: SessionState.Listening,
    stop: SessionState.Closed,
  },
  [SessionState.Closed]: {
    // 已关闭不可再转移
  },
};

export function transition(current: SessionState, event: TransitionEvent): SessionState {
  const next = VALID_TRANSITIONS[current]?.[event];
  if (!next) {
    throw new SessionError(
      `Invalid state transition: ${current} -> ${event}`,
      "INVALID_TRANSITION",
    );
  }
  return next;
}

/** 检查当前状态是否可以接受音频输入 */
export function canAcceptAudio(state: SessionState): boolean {
  return state === SessionState.Listening;
}
