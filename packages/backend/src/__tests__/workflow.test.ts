import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMvpGraph } from "../workflow/graph.js";
import { GlmService } from "../services/glmService.js";
import { DoubaoTtsService } from "../services/doubaoTts.js";
import { sessionManager } from "../session/sessionManager.js";

// ── Mock sessionManager ──────────────────────────────

vi.mock("../session/sessionManager.js", () => ({
  sessionManager: {
    getLatestFrame: vi.fn().mockReturnValue(undefined),
  },
}));

describe("MVP Workflow", () => {
  let mockGlmService: GlmService;
  let mockTtsService: DoubaoTtsService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock GLM service
    mockGlmService = {
      call: vi.fn().mockResolvedValue({
        text: "图片中有一只橙色的猫。",
        usage: { promptTokens: 800, completionTokens: 20, totalTokens: 820 },
        model: "glm-4v",
      }),
    } as unknown as GlmService;

    // Mock TTS service
    mockTtsService = {
      synthesize: vi.fn().mockResolvedValue({
        audio: Buffer.from([0x01, 0x02, 0x03]),
        encoding: "mp3",
      }),
    } as unknown as DoubaoTtsService;
  });

  // ── 图编译 ───────────────────────────────────────

  it("图编译成功", () => {
    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
  });

  // ── 完整流程：纯文本 ──────────────────────────────

  it("5 节点线性流程：纯文本输入 → AI 回复 → TTS 合成", async () => {
    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    const result = await graph.invoke({
      sessionId: "test-session",
      userText: "这是什么？",
    });

    // 验证 GLM 被调用
    expect(mockGlmService.call).toHaveBeenCalledTimes(1);
    expect(mockGlmService.call).toHaveBeenCalledWith({
      userText: "这是什么？",
      imageBase64: undefined,
    });

    // 验证 TTS 被调用
    expect(mockTtsService.synthesize).toHaveBeenCalledTimes(1);
    expect(mockTtsService.synthesize).toHaveBeenCalledWith({
      text: "图片中有一只橙色的猫。",
    });

    // 验证状态累积
    expect(result.assistantText).toBe("图片中有一只橙色的猫。");
    expect(result.assistantAudio).toEqual(Buffer.from([0x01, 0x02, 0x03]));
    expect(result.glmCalls).toBe(1);
    expect(result.ttsCalls).toBe(1);
    expect(result.error).toBeUndefined();
  });

  // ── 完整流程：带图片 ──────────────────────────────

  it("多模态：图片帧随状态流转到 GLM", async () => {
    const frame = "data:image/jpeg;base64,/9j/4AAQ";

    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    await graph.invoke({
      sessionId: "test-session",
      userText: "这是什么？",
      latestFrameBase64: frame,
    });

    // GLM 应收到图片
    expect(mockGlmService.call).toHaveBeenCalledWith({
      userText: "这是什么？",
      imageBase64: frame,
    });
  });

  // ── loadLatestFrame 集成 ─────────────────────────

  it("loadLatestFrame 从 sessionManager 读取帧", async () => {
    const mockedGetFrame = vi.mocked(sessionManager.getLatestFrame);
    mockedGetFrame.mockReturnValue("base64-from-session");

    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    await graph.invoke({
      sessionId: "test-session",
      userText: "这是什么？",
    });

    expect(sessionManager.getLatestFrame).toHaveBeenCalledWith("test-session");

    // 即使 initialState 没有 frame，loadLatestFrame 也应从 sessionManager 注入
    expect(mockGlmService.call).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBase64: "base64-from-session",
      }),
    );
  });

  // ── 错误处理 ─────────────────────────────────────

  it("GLM 调用失败时 error 字段被设置，TTS 跳过", async () => {
    mockGlmService.call = vi.fn().mockRejectedValue(new Error("GLM API timeout"));

    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    const result = await graph.invoke({
      sessionId: "test-session",
      userText: "test",
    });

    // GLM 失败
    expect(result.error).toContain("GLM error: GLM API timeout");
    // TTS 应跳过
    expect(mockTtsService.synthesize).not.toHaveBeenCalled();
    // assistant 字段为空
    expect(result.assistantText).toBeUndefined();
    expect(result.assistantAudio).toBeUndefined();
  });

  it("TTS 调用失败时 error 字段被设置", async () => {
    mockTtsService.synthesize = vi.fn().mockRejectedValue(new Error("TTS synthesis failed"));

    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    const result = await graph.invoke({
      sessionId: "test-session",
      userText: "test",
    });

    expect(result.assistantText).toBe("图片中有一只橙色的猫。");
    expect(result.error).toContain("TTS error: TTS synthesis failed");
    expect(result.assistantAudio).toBeUndefined();
  });

  // ── 空 assistantText 跳过 TTS ────────────────────

  it("assistantText 为空时 TTS 跳过", async () => {
    mockGlmService.call = vi.fn().mockResolvedValue({
      text: "", // GLM 返回空文本
      usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
      model: "glm-4v",
    });

    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    await graph.invoke({
      sessionId: "test-session",
      userText: "test",
    });

    // TTS 不应被调用（空文本）
    expect(mockTtsService.synthesize).not.toHaveBeenCalled();
  });

  // ── userText trim ─────────────────────────────────

  it("receiveTurn 修剪 userText 首尾空白", async () => {
    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    await graph.invoke({
      sessionId: "test-session",
      userText: "  你好世界  ",
    });

    expect(mockGlmService.call).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: "你好世界",
      }),
    );
  });

  // ── 用量计数 ─────────────────────────────────────

  it("glmCalls 和 ttsCalls 计数正确", async () => {
    const graph = createMvpGraph({
      glmService: mockGlmService,
      ttsService: mockTtsService,
    });

    const result = await graph.invoke({
      sessionId: "test-session",
      userText: "test",
    });

    expect(result.glmCalls).toBe(1);
    expect(result.ttsCalls).toBe(1);
    expect(result.asrCalls).toBe(0); // ASR 在本 workflow 之前完成
  });
});
