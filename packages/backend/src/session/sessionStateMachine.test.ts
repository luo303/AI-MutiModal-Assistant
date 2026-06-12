import { describe, it, expect } from "vitest";
import { transition, canAcceptAudio } from "./sessionStateMachine.js";
import { SessionState } from "../types/session.js";

describe("sessionStateMachine", () => {
  describe("合法状态转移", () => {
    it("idle → listening (start)", () => {
      expect(transition(SessionState.Idle, "start")).toBe(SessionState.Listening);
    });

    it("listening → transcribing (turnEnd)", () => {
      expect(transition(SessionState.Listening, "turnEnd")).toBe(SessionState.Transcribing);
    });

    it("transcribing → thinking (asrFinal)", () => {
      expect(transition(SessionState.Transcribing, "asrFinal")).toBe(SessionState.Thinking);
    });

    it("thinking → speaking (assistantAudio)", () => {
      expect(transition(SessionState.Thinking, "assistantAudio")).toBe(SessionState.Speaking);
    });

    it("speaking → listening (playbackDone)", () => {
      expect(transition(SessionState.Speaking, "playbackDone")).toBe(SessionState.Listening);
    });

    it("任意状态 → closed (stop)", () => {
      expect(transition(SessionState.Idle, "stop")).toBe(SessionState.Closed);
      expect(transition(SessionState.Listening, "stop")).toBe(SessionState.Closed);
      expect(transition(SessionState.Transcribing, "stop")).toBe(SessionState.Closed);
      expect(transition(SessionState.Thinking, "stop")).toBe(SessionState.Closed);
      expect(transition(SessionState.Speaking, "stop")).toBe(SessionState.Closed);
    });
  });

  describe("非法状态转移", () => {
    it("idle + turnEnd → 抛错", () => {
      expect(() => transition(SessionState.Idle, "turnEnd")).toThrow();
    });

    it("idle + asrFinal → 抛错", () => {
      expect(() => transition(SessionState.Idle, "asrFinal")).toThrow();
    });

    it("listening + asrFinal → 抛错", () => {
      expect(() => transition(SessionState.Listening, "asrFinal")).toThrow();
    });

    it("listening + assistantAudio → 抛错", () => {
      expect(() => transition(SessionState.Listening, "assistantAudio")).toThrow();
    });

    it("speaking + turnEnd → 抛错", () => {
      expect(() => transition(SessionState.Speaking, "turnEnd")).toThrow();
    });

    it("transcribing + playbackDone → 抛错", () => {
      expect(() => transition(SessionState.Transcribing, "playbackDone")).toThrow();
    });

    it("thinking + playbackDone → 抛错", () => {
      expect(() => transition(SessionState.Thinking, "playbackDone")).toThrow();
    });

    it("closed + start → 抛错", () => {
      expect(() => transition(SessionState.Closed, "start")).toThrow();
    });
  });

  describe("完整对话循环", () => {
    it("一轮完整对话：listening → transcribing → thinking → speaking → listening", () => {
      let state = SessionState.Listening;
      state = transition(state, "turnEnd");
      expect(state).toBe(SessionState.Transcribing);

      state = transition(state, "asrFinal");
      expect(state).toBe(SessionState.Thinking);

      state = transition(state, "assistantAudio");
      expect(state).toBe(SessionState.Speaking);

      state = transition(state, "playbackDone");
      expect(state).toBe(SessionState.Listening);
    });
  });

  describe("canAcceptAudio", () => {
    it("仅 listening 状态返回 true", () => {
      expect(canAcceptAudio(SessionState.Listening)).toBe(true);
    });

    it("非 listening 状态返回 false", () => {
      expect(canAcceptAudio(SessionState.Idle)).toBe(false);
      expect(canAcceptAudio(SessionState.Transcribing)).toBe(false);
      expect(canAcceptAudio(SessionState.Thinking)).toBe(false);
      expect(canAcceptAudio(SessionState.Speaking)).toBe(false);
      expect(canAcceptAudio(SessionState.Closed)).toBe(false);
    });
  });
});
