import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GlmService } from "../services/glmService.js";

// ── Mock fetch ────────────────────────────────────────

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

describe("GlmService", () => {
  let service: GlmService;

  beforeEach(() => {
    service = new GlmService();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 成功响应 ───────────────────────────────────────

  it("纯文本调用返回 AI 回复", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        id: "chatcmpl-001",
        model: "glm-4v",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "你好！我是一个AI助手。" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
        },
      }),
    );

    const result = await service.call({
      userText: "你好，你是谁？",
    });

    expect(result.text).toBe("你好！我是一个AI助手。");
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
    });
    expect(result.model).toBe("glm-4v");

    // 验证请求体格式
    const reqBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(reqBody.model).toBe("glm-4v");
    expect(reqBody.messages[0].role).toBe("system");
    expect(reqBody.messages[1].role).toBe("user");
    expect(reqBody.messages[1].content[0]).toEqual({
      type: "text",
      text: "你好，你是谁？",
    });
    // 纯文本调用不应包含图片
    expect(reqBody.messages[1].content).toHaveLength(1);
  });

  it("多模态调用（文字 + 图片）发送正确格式", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        model: "glm-4v",
        choices: [
          {
            message: { content: "图片中有一只猫。" },
          },
        ],
        usage: { prompt_tokens: 500, completion_tokens: 15, total_tokens: 515 },
      }),
    );

    const result = await service.call({
      userText: "这是什么？",
      imageBase64: "iVBORw0KGgoAAAANSUhEUg==",
    });

    expect(result.text).toBe("图片中有一只猫。");

    const reqBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    const userContent = reqBody.messages[1].content as Array<Record<string, unknown>>;

    expect(userContent).toHaveLength(2);
    expect(userContent[0]).toEqual({ type: "text", text: "这是什么？" });
    expect(userContent[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUg==" },
    });
  });

  it("保留已有的 data: URI 前缀", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: "ok" } }],
        usage: {},
      }),
    );

    await service.call({
      userText: "test",
      imageBase64: "data:image/png;base64,abc123",
    });

    const reqBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    const imgUrl = reqBody.messages[1].content[1].image_url.url as string;
    expect(imgUrl).toBe("data:image/png;base64,abc123");
    // 不应再加前缀
    expect(imgUrl).not.toContain("data:image/jpeg;base64,data:image/png");
  });

  // ── 请求配置 ───────────────────────────────────────

  it("支持自定义 systemPrompt、model、maxTokens、temperature", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: "result" } }],
        usage: {},
      }),
    );

    await service.call({
      userText: "test",
      systemPrompt: "自定义提示词",
      model: "glm-4v-flash",
      maxTokens: 512,
      temperature: 0.3,
    });

    const reqBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(reqBody.messages[0].content).toBe("自定义提示词");
    expect(reqBody.model).toBe("glm-4v-flash");
    expect(reqBody.max_tokens).toBe(512);
    expect(reqBody.temperature).toBe(0.3);
  });

  // ── 错误处理 ───────────────────────────────────────

  it("API 返回非 200 时抛出 GlmError", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ error: { message: "Invalid API key" } }, 401),
    );

    await expect(
      service.call({ userText: "test" }),
    ).rejects.toThrow("GLM API returned 401");
  });

  it("API 返回空 choices 时抛出 GlmError", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [],
        usage: {},
      }),
    );

    await expect(
      service.call({ userText: "test" }),
    ).rejects.toThrow("empty response");
  });

  it("API 返回无 message 时抛出 GlmError", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: null }],
        usage: {},
      }),
    );

    await expect(
      service.call({ userText: "test" }),
    ).rejects.toThrow("empty response");
  });

  // ── 超时 ───────────────────────────────────────────

  it("请求使用 30 秒 AbortSignal 超时", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: "ok" } }],
        usage: {},
      }),
    );

    await service.call({ userText: "test" });

    const init = mockFetch.mock.calls[0]![1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // AbortSignal.timeout(30_000) 创建的 signal
    expect(init.signal?.aborted).toBe(false);
  });

  // ── endpoint ────────────────────────────────────────

  it("使用正确的 chat/completions endpoint（无双斜杠）", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        choices: [{ message: { content: "ok" } }],
        usage: {},
      }),
    );

    await service.call({ userText: "test" });

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("/chat/completions");
    // 不应有双斜杠
    expect(url).not.toContain("//chat");
  });
});
