import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { GlmError } from "../lib/errors.js";

const MODULE = "glmService";

// ── 默认配置 ─────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = [
  "你是一个 AI 视觉助手，可以通过摄像头看到用户面前的画面。",
  "用户会用口语描述他们的需求，请用自然、口语化的中文简洁回答。",
  "回答控制在 3 句话以内，像朋友聊天一样，不要用列表或 Markdown 格式。",
].join(" ");

const DEFAULT_MODEL = "glm-4v";

// ── 类型 ──────────────────────────────────────────────

export interface GlmCallOptions {
  /** 用户的文字输入（来自 ASR 识别结果） */
  userText: string;
  /** 摄像头帧（base64，可选 data:image/... 前缀） */
  imageBase64?: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 模型名称 */
  model?: string;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 采样温度 */
  temperature?: number;
}

export interface GlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GlmCallResult {
  text: string;
  usage: GlmUsage;
  model: string;
}

// ── GlmService ───────────────────────────────────────

/**
 * 智谱 GLM-4V/5V 多模态视觉理解服务
 *
 * 调用 GLM chat/completions API（OpenAI 兼容格式），
 * 支持文字 + 图片（多模态）输入。
 *
 * ```typescript
 * const result = await glmService.call({
 *   userText: "这是什么？",
 *   imageBase64: "iVBORw0KGgo...",
 * });
 * console.log(result.text);
 * ```
 */
export class GlmService {
  /**
   * 调用 GLM 多模态模型
   *
   * @returns AI 回复文本 + 用量统计
   * @throws {GlmError} API 调用失败或返回空响应
   */
  async call(options: GlmCallOptions): Promise<GlmCallResult> {
    const {
      userText,
      imageBase64,
      systemPrompt = DEFAULT_SYSTEM_PROMPT,
      model = DEFAULT_MODEL,
      maxTokens = 1024,
      temperature = 0.7,
    } = options;

    // 注意：chat/completions 不能以 / 开头，否则 new URL() 会替换整个 base path
    const endpoint = new URL("chat/completions", env.GLM_API_BASE_URL).toString();

    // 构建 user message content：文字 + 可选图片
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: userText },
    ];

    if (imageBase64) {
      // 确保图片有 data URI 前缀（智谱 API 支持纯 base64 和完整 data URI）
      const imageUrl = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      userContent.push({
        type: "image_url",
        image_url: { url: imageUrl },
      });
    }

    const body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: maxTokens,
      temperature,
    };

    logger.info(MODULE, "Calling GLM", {
      endpoint,
      model,
      textLen: userText.length,
      hasImage: !!imageBase64,
    });

    // 30 秒超时
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GLM_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      logger.error(MODULE, "GLM API error", {
        status: response.status,
        body: errorBody.slice(0, 300),
      });
      throw new GlmError(
        `GLM API returned ${response.status}: ${errorBody.slice(0, 200)}`,
      );
    }

    const json = (await response.json()) as GlmResponse;

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      logger.error(MODULE, "GLM returned empty response", { json });
      throw new GlmError("GLM returned empty response");
    }

    const usage: GlmUsage = {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    };

    logger.info(MODULE, "GLM response received", {
      textLen: content.length,
      usage,
    });

    return { text: content, usage, model: json.model ?? model };
  }
}

// ── 原始 JSON 响应结构 ───────────────────────────────

interface GlmResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** 全局单例 */
export const glmService = new GlmService();
