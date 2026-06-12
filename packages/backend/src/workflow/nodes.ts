import { sessionManager } from "../session/sessionManager.js";
import { GlmService } from "../services/glmService.js";
import { DoubaoTtsService } from "../services/doubaoTts.js";
import { logger } from "../lib/logger.js";
import type { WorkflowStateType, WorkflowUpdateType } from "./state.js";

const MODULE = "workflow";

// ── 依赖注入类型 ────────────────────────────────────

export interface WorkflowDeps {
  glmService: GlmService;
  ttsService: DoubaoTtsService;
}

// ── Node 1: receiveTurn ─────────────────────────────

/**
 * 标准化输入数据。
 * 此节点为纯函数，无需外部依赖。
 */
export function receiveTurnNode(state: WorkflowStateType): WorkflowUpdateType {
  logger.info(MODULE, "Node: receiveTurn", { sessionId: state.sessionId });

  return {
    userText: state.userText.trim(),
  };
}

// ── Node 2: loadLatestFrame ─────────────────────────

/**
 * 从 sessionManager 读取最新摄像头帧。
 */
export function loadLatestFrameNodeFactory(_deps: WorkflowDeps) {
  return (state: WorkflowStateType): WorkflowUpdateType => {
    logger.info(MODULE, "Node: loadLatestFrame", { sessionId: state.sessionId });

    const frame = sessionManager.getLatestFrame(state.sessionId);

    if (frame) {
      logger.info(MODULE, "Latest frame loaded", {
        sessionId: state.sessionId,
        frameLen: frame.length,
      });
    }

    // 仅当 sessionManager 有新帧时才覆盖，否则保留 state 已有值
    if (frame) {
      return { latestFrameBase64: frame };
    }

    return {};
  };
}

// ── Node 3: callGlm5vTurbo ──────────────────────────

/**
 * 调用 GLM-4V 多模态模型进行视觉理解。
 */
export function callGlm5vTurboNodeFactory(deps: WorkflowDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowUpdateType> => {
    logger.info(MODULE, "Node: callGlm5vTurbo", {
      sessionId: state.sessionId,
      hasImage: !!state.latestFrameBase64,
    });

    try {
      const result = await deps.glmService.call({
        userText: state.userText,
        imageBase64: state.latestFrameBase64,
      });

      logger.info(MODULE, "GLM response", {
        sessionId: state.sessionId,
        textLen: result.text.length,
      });

      return {
        assistantText: result.text,
        glmCalls: 1,
      };
    } catch (err) {
      logger.error(MODULE, "GLM call failed", {
        sessionId: state.sessionId,
        error: (err as Error).message,
      });
      return {
        error: `GLM error: ${(err as Error).message}`,
      };
    }
  };
}

// ── Node 4: synthesizeWithDoubaoTts ──────────────────

/**
 * 将 AI 文本转换为语音。
 */
export function synthesizeWithDoubaoTtsNodeFactory(deps: WorkflowDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowUpdateType> => {
    if (!state.assistantText || state.error) {
      logger.info(MODULE, "Node: synthesizeWithDoubaoTts skipped", {
        sessionId: state.sessionId,
        hasText: !!state.assistantText,
        hasError: !!state.error,
      });
      return {};
    }

    logger.info(MODULE, "Node: synthesizeWithDoubaoTts", {
      sessionId: state.sessionId,
      textLen: state.assistantText.length,
    });

    try {
      const { audio } = await deps.ttsService.synthesize({
        text: state.assistantText,
      });

      logger.info(MODULE, "TTS synthesized", {
        sessionId: state.sessionId,
        audioSize: audio.length,
      });

      return {
        assistantAudio: audio,
        ttsCalls: 1,
      };
    } catch (err) {
      logger.error(MODULE, "TTS synthesis failed", {
        sessionId: state.sessionId,
        error: (err as Error).message,
      });
      return {
        error: `TTS error: ${(err as Error).message}`,
      };
    }
  };
}

// ── Node 5: recordUsage ────────────────────────────

/**
 * 记录本轮用量（占位，Phase 7 接入 UsageRecorder）。
 */
export function recordUsageNodeFactory(_deps: WorkflowDeps) {
  return (state: WorkflowStateType): WorkflowUpdateType => {
    logger.info(MODULE, "Node: recordUsage", {
      sessionId: state.sessionId,
      asrCalls: state.asrCalls,
      glmCalls: state.glmCalls,
      ttsCalls: state.ttsCalls,
    });

    // Phase 7 接入 UsageRecorder
    return {};
  };
}
