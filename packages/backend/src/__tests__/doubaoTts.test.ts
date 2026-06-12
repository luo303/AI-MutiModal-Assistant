import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DoubaoTtsService } from "../services/doubaoTts.js";

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

/** 创建成功响应：code=3000，data 为 base64 编码的音频 */
function mockSuccessResponse(base64Audio = "//uQxAAAA") {
  return mockJsonResponse({
    code: 3000,
    message: "Success",
    reqid: "test-req-001",
    data: base64Audio,
    addition: {},
  });
}

describe("DoubaoTtsService", () => {
  let service: DoubaoTtsService;

  beforeEach(() => {
    service = new DoubaoTtsService();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 成功合成 ───────────────────────────────────────

  it("合成成功返回 Buffer", async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse("aGVsbG8=")); // "hello" in base64

    const result = await service.synthesize({ text: "你好" });

    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.audio.toString()).toBe("hello");
    expect(result.encoding).toBe("mp3");
  });

  it("合成中文文本", async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse("d29ybGQ=")); // "world"

    const result = await service.synthesize({
      text: "你好世界，这是一个测试。",
    });

    expect(result.audio.length).toBeGreaterThan(0);
    expect(result.encoding).toBe("mp3");
  });

  // ── 请求体格式 ─────────────────────────────────────

  it("发送嵌套 body 结构（app/user/audio/request）", async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse());

    await service.synthesize({ text: "测试" });

    const reqBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);

    // 验证嵌套结构
    expect(reqBody.app).toBeDefined();
    expect(reqBody.app.appid).toBeDefined();
    expect(reqBody.app.token).toBeDefined();
    expect(reqBody.app.cluster).toBe("volcano_tts");

    expect(reqBody.user).toBeDefined();
    expect(reqBody.user.uid).toBe("mvp-user");

    expect(reqBody.audio).toBeDefined();
    expect(reqBody.audio.voice_type).toBe("BV701_streaming");
    expect(reqBody.audio.encoding).toBe("mp3");

    expect(reqBody.request).toBeDefined();
    expect(reqBody.request.text).toBe("测试");
    expect(reqBody.request.operation).toBe("query");
    expect(reqBody.request.reqid).toBeDefined();
  });

  it("Authorization header 格式为 Bearer;{token}", async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse());

    await service.synthesize({ text: "test" });

    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer;/);
  });

  // ── 自定义配置 ─────────────────────────────────────

  it("支持自定义 voice、encoding、speedRatio、volumeRatio", async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse());

    await service.synthesize({
      text: "test",
      voice: "zh_male_qingxin",
      encoding: "wav",
      speedRatio: 1.5,
      volumeRatio: 0.8,
    });

    const reqBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(reqBody.audio.voice_type).toBe("zh_male_qingxin");
    expect(reqBody.audio.encoding).toBe("wav");
    expect(reqBody.audio.speed_ratio).toBe(1.5);
    expect(reqBody.audio.volume_ratio).toBe(0.8);
  });

  it("返回的 encoding 与请求一致", async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse());

    const result = await service.synthesize({
      text: "test",
      encoding: "wav",
    });

    expect(result.encoding).toBe("wav");
  });

  // ── 错误处理 ───────────────────────────────────────

  it("空文本抛出 TtsError", async () => {
    await expect(
      service.synthesize({ text: "" }),
    ).rejects.toThrow("TTS text cannot be empty");
  });

  it("纯空白文本抛出 TtsError", async () => {
    await expect(
      service.synthesize({ text: "   " }),
    ).rejects.toThrow("TTS text cannot be empty");
  });

  it("API 返回 code ≠ 3000 时抛出 TtsError", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 3001,
        message: "requested resource not granted",
        reqid: "test-req",
      }),
    );

    await expect(
      service.synthesize({ text: "test" }),
    ).rejects.toThrow("TTS API error [3001]");
  });

  it("data 为空时抛出 TtsError", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        code: 3000,
        message: "Success",
        data: "",
      }),
    );

    await expect(
      service.synthesize({ text: "test" }),
    ).rejects.toThrow("empty audio");
  });

  it("HTTP 非 200 且 code ≠ 3000 时抛出 TtsError", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(
        {
          code: 3001,
          message: "Internal error",
        },
        500,
      ),
    );

    await expect(
      service.synthesize({ text: "test" }),
    ).rejects.toThrow("TTS API error");
  });

  // ── 超时 ───────────────────────────────────────────

  it("请求使用 30 秒 AbortSignal 超时", async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse());

    await service.synthesize({ text: "test" });

    const init = mockFetch.mock.calls[0]![1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });
});
