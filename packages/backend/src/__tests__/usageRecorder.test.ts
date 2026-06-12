import { describe, it, expect, beforeEach } from "vitest";
import { UsageRecorder, type TurnMetrics } from "../services/usageRecorder.js";

describe("UsageRecorder", () => {
  let recorder: UsageRecorder;

  beforeEach(() => {
    recorder = new UsageRecorder();
  });

  // ── recordTurn ────────────────────────────────────

  it("首次调用 recordTurn 创建会话并正确记录", () => {
    const metrics: TurnMetrics = {
      asrCalls: 0,
      glmCalls: 1,
      ttsCalls: 1,
      hasImage: true,
    };

    const usage = recorder.recordTurn("session-1", metrics);

    expect(usage.sessionId).toBe("session-1");
    expect(usage.asrCalls).toBe(0);
    expect(usage.glmCalls).toBe(1);
    expect(usage.ttsCalls).toBe(1);
    expect(usage.totalTurns).toBe(1);
  });

  it("同一会话多次调用累加计数", () => {
    const turn1: TurnMetrics = { asrCalls: 0, glmCalls: 1, ttsCalls: 1, hasImage: false };
    const turn2: TurnMetrics = { asrCalls: 0, glmCalls: 1, ttsCalls: 1, hasImage: true };

    recorder.recordTurn("session-1", turn1);
    const usage = recorder.recordTurn("session-1", turn2);

    expect(usage.glmCalls).toBe(2);
    expect(usage.ttsCalls).toBe(2);
    expect(usage.totalTurns).toBe(2);
  });

  it("不同会话独立记录", () => {
    const metrics: TurnMetrics = { asrCalls: 0, glmCalls: 1, ttsCalls: 1, hasImage: false };

    recorder.recordTurn("session-a", metrics);
    recorder.recordTurn("session-a", metrics);
    const usageB = recorder.recordTurn("session-b", metrics);

    // session-b 不受 session-a 影响
    expect(usageB.glmCalls).toBe(1);
    expect(usageB.totalTurns).toBe(1);
  });

  // ── getUsage ──────────────────────────────────────

  it("getUsage 返回累计用量", () => {
    const metrics: TurnMetrics = { asrCalls: 0, glmCalls: 3, ttsCalls: 2, hasImage: true };

    recorder.recordTurn("session-1", metrics);
    recorder.recordTurn("session-1", metrics);

    const usage = recorder.getUsage("session-1");
    expect(usage?.glmCalls).toBe(6);
    expect(usage?.ttsCalls).toBe(4);
    expect(usage?.totalTurns).toBe(2);
  });

  it("getUsage 对不存在会话返回 undefined", () => {
    expect(recorder.getUsage("nonexistent")).toBeUndefined();
  });

  // ── reset ─────────────────────────────────────────

  it("reset 清除会话数据", () => {
    const metrics: TurnMetrics = { asrCalls: 0, glmCalls: 1, ttsCalls: 1, hasImage: false };

    recorder.recordTurn("session-1", metrics);
    expect(recorder.getUsage("session-1")).toBeDefined();

    recorder.reset("session-1");
    expect(recorder.getUsage("session-1")).toBeUndefined();
  });

  // ── toPayload ─────────────────────────────────────

  it("toPayload 输出 UsageUpdatePayload 格式", () => {
    const metrics: TurnMetrics = { asrCalls: 0, glmCalls: 2, ttsCalls: 1, hasImage: false };

    recorder.recordTurn("session-1", metrics);
    recorder.recordTurn("session-1", metrics);

    const payload = recorder.toPayload("session-1");

    expect(payload).toEqual({
      sessionId: "session-1",
      asrCalls: 0,
      glmCalls: 4,
      ttsCalls: 2,
      totalTurns: 2,
    });
  });

  it("toPayload 对不存在的会话返回 null", () => {
    expect(recorder.toPayload("ghost")).toBeNull();
  });

  // ── 边界情况 ──────────────────────────────────────

  it("零调用轮次正常记录", () => {
    const metrics: TurnMetrics = { asrCalls: 0, glmCalls: 0, ttsCalls: 0, hasImage: false };

    const usage = recorder.recordTurn("empty", metrics);

    expect(usage.totalTurns).toBe(1);
    expect(usage.glmCalls).toBe(0);
  });

  it("recordTurn 返回独立副本（不随后续累加变化）", () => {
    const metrics: TurnMetrics = { asrCalls: 0, glmCalls: 1, ttsCalls: 1, hasImage: false };

    const snapshot = recorder.recordTurn("session-1", metrics);
    recorder.recordTurn("session-1", metrics); // 再记录一轮

    // 快照不应受后续累加影响
    expect(snapshot.glmCalls).toBe(1);
    expect(snapshot.totalTurns).toBe(1);
  });
});
