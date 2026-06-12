import { logger } from "../lib/logger.js";
import type { UsageUpdatePayload } from "../types/events.js";

const MODULE = "usageRecorder";

// ── 类型 ──────────────────────────────────────────────

export interface TurnMetrics {
  /** 本轮 ASR 调用次数（通常为 0，ASR 在图外完成） */
  asrCalls: number;
  /** 本轮 GLM 调用次数 */
  glmCalls: number;
  /** 本轮 TTS 调用次数 */
  ttsCalls: number;
  /** 本轮是否包含图片帧 */
  hasImage: boolean;
}

export interface SessionUsage {
  sessionId: string;
  asrCalls: number;
  glmCalls: number;
  ttsCalls: number;
  totalTurns: number;
}

// ── UsageRecorder ─────────────────────────────────────

/**
 * 内存用量记录器
 *
 * 按会话累积每轮的 API 调用次数，会话结束时可以取出汇总数据。
 * MVP 阶段为内存存储，后续可扩展为持久化存储。
 *
 * ```typescript
 * usageRecorder.recordTurn("session-1", { asrCalls: 0, glmCalls: 1, ttsCalls: 1, hasImage: true });
 * const payload = usageRecorder.toPayload("session-1");
 * ```
 */
export class UsageRecorder {
  private store = new Map<string, SessionUsage>();

  /**
   * 记录一轮对话的用量，累加到会话汇总。
   *
   * @returns 更新后的会话汇总
   */
  recordTurn(sessionId: string, metrics: TurnMetrics): SessionUsage {
    const entry = this.store.get(sessionId) ?? {
      sessionId,
      asrCalls: 0,
      glmCalls: 0,
      ttsCalls: 0,
      totalTurns: 0,
    };

    entry.asrCalls += metrics.asrCalls;
    entry.glmCalls += metrics.glmCalls;
    entry.ttsCalls += metrics.ttsCalls;
    entry.totalTurns += 1;

    this.store.set(sessionId, entry);

    logger.info(MODULE, "Turn recorded", {
      sessionId,
      metrics,
      totals: { ...entry },
    });

    return { ...entry };
  }

  /** 查询某个会话的累计用量 */
  getUsage(sessionId: string): SessionUsage | undefined {
    return this.store.get(sessionId);
  }

  /** 会话结束时清理数据 */
  reset(sessionId: string): void {
    this.store.delete(sessionId);
    logger.info(MODULE, "Session usage cleared", { sessionId });
  }

  /** 转换为前端推送格式 */
  toPayload(sessionId: string): UsageUpdatePayload | null {
    const usage = this.getUsage(sessionId);
    if (!usage) return null;
    return {
      sessionId,
      asrCalls: usage.asrCalls,
      glmCalls: usage.glmCalls,
      ttsCalls: usage.ttsCalls,
      totalTurns: usage.totalTurns,
    };
  }
}

/** 全局单例 */
export const usageRecorder = new UsageRecorder();
