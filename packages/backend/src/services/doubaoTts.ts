import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { TtsError } from "../lib/errors.js";

const MODULE = "doubaoTts";

// ── 火山引擎 TTS HTTP 端点 ────────────────────────────
const TTS_URL = "https://openspeech.bytedance.com/api/v1/tts";

// ── 音色 ──────────────────────────────────────────────
const DEFAULT_VOICE = "BV701_streaming";

// ── 类型 ──────────────────────────────────────────────

export interface TtsOptions {
  /** 要合成的文本 */
  text: string;
  /** 音色类型 */
  voice?: string;
  /** 音频编码格式 */
  encoding?: "mp3" | "wav" | "ogg";
  /** 语速 (0.5 ~ 2.0) */
  speedRatio?: number;
  /** 音量 (0.5 ~ 2.0) */
  volumeRatio?: number;
}

export interface TtsResult {
  /** 音频二进制数据（已从 base64 JSON 解码） */
  audio: Buffer;
  /** 音频编码格式 */
  encoding: string;
}

// ── DoubaoTtsService ──────────────────────────────────

/**
 * 豆包语音合成服务
 *
 * 调用火山引擎 TTS HTTP 非流式 API，将文本转为语音。
 * 认证方式：Authorization: Bearer;{token} header（不是 body 内嵌 token）。
 * 响应为 JSON 包 base64 音频，服务自动解码为 Buffer。
 *
 * ```typescript
 * const { audio, encoding } = await ttsService.synthesize({
 *   text: "你好，我是AI助手",
 * });
 * ```
 */
export class DoubaoTtsService {
  /**
   * 合成语音
   *
   * @returns 音频 Buffer + 编码格式
   * @throws {TtsError} API 调用失败
   */
  async synthesize(options: TtsOptions): Promise<TtsResult> {
    const {
      text,
      voice = DEFAULT_VOICE,
      encoding = "mp3",
      speedRatio = 1.0,
      volumeRatio = 1.0,
    } = options;

    if (!text.trim()) {
      throw new TtsError("TTS text cannot be empty");
    }

    const body = {
      app: {
        appid: env.DOUBAO_TTS_APP_ID,
        token: env.DOUBAO_TTS_ACCESS_TOKEN,
        cluster: "volcano_tts",
      },
      user: {
        uid: "mvp-user",
      },
      audio: {
        voice_type: voice,
        encoding,
        rate: 24000,
        speed_ratio: speedRatio,
        volume_ratio: volumeRatio,
        pitch_ratio: 1.0,
      },
      request: {
        reqid: randomUUID(),
        text,
        text_type: "plain",
        operation: "query",
        silence_duration: 125,
      },
    };

    logger.info(MODULE, "TTS request", {
      textLen: text.length,
      voice,
      encoding,
    });

    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer;${env.DOUBAO_TTS_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    // TTS HTTP 非流式 API 返回 JSON
    // 成功: { code: 3000, message: "Success", data: "<base64>" }
    // 失败: HTTP 错误状态码 + JSON error body 或 code ≠ 3000
    const json = (await response.json()) as TtsHttpResponse;

    if (!response.ok || json.code !== 3000) {
      logger.error(MODULE, "TTS API error", {
        status: response.status,
        code: json.code,
        message: json.message,
        reqid: json.reqid,
      });
      throw new TtsError(
        `TTS API error [${json.code ?? response.status}]: ${json.message ?? "unknown"}`,
      );
    }

    // data 字段包含 base64 编码的音频
    if (!json.data || json.data.length === 0) {
      throw new TtsError("TTS returned empty audio data");
    }

    const audioBuffer = Buffer.from(json.data, "base64");

    logger.info(MODULE, "TTS response received", {
      audioSize: audioBuffer.length,
      encoding,
    });

    return { audio: audioBuffer, encoding };
  }
}

// ── API 响应结构 ──────────────────────────────────────

interface TtsHttpResponse {
  code: number;
  message?: string;
  reqid?: string;
  data?: string; // base64 音频
  addition?: Record<string, unknown>;
}

/** 全局单例 */
export const doubaoTts = new DoubaoTtsService();
