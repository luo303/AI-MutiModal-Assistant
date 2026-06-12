import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { Buffer } from "node:buffer";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { AsrError } from "../lib/errors.js";
import {
  MSG_FULL_REQUEST,
  MSG_AUDIO_ONLY,
  MSG_SERVER_RESPONSE,
  MSG_ERROR,
  FLAG_NO_SEQ,
  FLAG_POS_SEQ,
  FLAG_NEG_SEQ,
  SERIAL_JSON,
  SERIAL_RAW,
  COMPRESS_NONE,
  buildHeader,
  buildFrame,
  parseFrame,
  extractJsonPayload,
} from "./doubaoAsrProtocol.js";

const MODULE = "doubaoAsr";

// ── 火山引擎 ASR 端点 ─────────────────────────────────
const ASR_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";

// ── 类型 ──────────────────────────────────────────────

export interface AsrCallbacks {
  onPartial: (sessionId: string, text: string) => void;
  onFinal: (sessionId: string, text: string) => void;
  onError: (sessionId: string, error: Error) => void;
}

interface AsrSession {
  ws: WebSocket;
  sessionId: string;
  seqNo: number;
  partialText: string;
  accumulatedText: string;
  callbacks: AsrCallbacks;
  resultPromise: Promise<string>;
  resolveResult: ((text: string) => void) | null;
  rejectResult: ((error: Error) => void) | null;
  connectTimeout: NodeJS.Timeout | null;
  resultTimeout: NodeJS.Timeout | null;
}

// ── DoubaoAsrService ──────────────────────────────────

/**
 * 豆包流式语音识别服务
 *
 * 每个 recognition session 对应一个火山引擎 ASR WebSocket 连接。
 * 使用 bigmodel_async 双向流式优化端点。
 *
 * ```typescript
 * await asrService.startRecognition(sessionId, callbacks);
 * asrService.sendAudioChunk(sessionId, pcmBuffer);
 * const finalText = await asrService.stopRecognition(sessionId);
 * ```
 */
export class DoubaoAsrService {
  private sessions = new Map<string, AsrSession>();
  /** 正在建立中的 session，防止并发的 audio.chunk 触发重复连接 */
  private pendingSessions = new Set<string>();
  /** 连接建立前到达的 chunk 缓冲区 */
  private pendingChunks = new Map<string, Buffer[]>();

  /**
   * 开始识别——建立 WebSocket 连接并发送 Full Client Request
   */
  startRecognition(sessionId: string, callbacks: AsrCallbacks): Promise<void> {
    logger.info(MODULE, `Starting ASR recognition`, { sessionId });

    // 防止竞态：立即标记为 pending
    this.pendingSessions.add(sessionId);

    return new Promise((resolve, reject) => {
      let settled = false;

      const finishConnect = () => {
        if (settled) return;
        settled = true;
        this.pendingSessions.delete(sessionId);
        if (connectTimeout) clearTimeout(connectTimeout);
        resolve();
      };

      const failConnect = (err: Error) => {
        if (settled) return;
        settled = true;
        this.pendingSessions.delete(sessionId);
        if (connectTimeout) clearTimeout(connectTimeout);
        reject(err);
      };

      const ws = new WebSocket(ASR_URL, {
        headers: {
          "X-Api-App-Key": env.DOUBAO_ASR_APP_ID,
          "X-Api-Access-Key": env.DOUBAO_ASR_ACCESS_TOKEN,
          "X-Api-Resource-Id": "volc.seedasr.sauc.duration",
          "X-Api-Request-Id": randomUUID(),
          "X-Api-Sequence": "-1",
        },
      });

      let resultResolve: ((text: string) => void) | null = null;
      let resultReject: ((error: Error) => void) | null = null;
      const resultPromise = new Promise<string>((res, rej) => {
        resultResolve = res;
        resultReject = rej;
      });

      const session: AsrSession = {
        ws,
        sessionId,
        seqNo: 1, // Full Client Request = 包#1, 音频从 #2 开始
        partialText: "",
        accumulatedText: "",
        callbacks,
        resultPromise,
        resolveResult: resultResolve,
        rejectResult: resultReject,
        connectTimeout: null,
        resultTimeout: null,
      };

      ws.on("open", () => {
        this.sessions.set(sessionId, session);
        this.sendFullClientRequest(session);
        logger.info(MODULE, `ASR connected`, { sessionId });

        // flush 连接建立前缓冲的音频 chunks
        const buffered = this.pendingChunks.get(sessionId);
        if (buffered && buffered.length > 0) {
          logger.info(MODULE, `Flushing buffered audio chunks`, {
            sessionId,
            count: buffered.length,
          });
          for (const c of buffered) {
            session.seqNo++;
            const h = buildHeader(MSG_AUDIO_ONLY, FLAG_POS_SEQ, SERIAL_RAW, COMPRESS_NONE);
            session.ws.send(buildFrame(h, c, session.seqNo));
          }
          this.pendingChunks.delete(sessionId);
        }

        finishConnect();
      });

      ws.on("message", (raw: Buffer) => {
        try {
          this.handleServerMessage(session, raw);
        } catch (err) {
          logger.error(MODULE, `Message handler error`, { sessionId, error: err });
          callbacks.onError(sessionId, new AsrError(String(err)));
        }
      });

      ws.on("error", (err) => {
        logger.error(MODULE, `ASR WebSocket error`, { sessionId, error: err.message });
        failConnect(new AsrError(`ASR connection failed: ${err.message}`));
        this.cleanup(sessionId);
      });

      ws.on("close", (code, reason) => {
        logger.info(MODULE, `ASR WebSocket closed`, {
          sessionId,
          code,
          reason: reason.toString(),
        });
        this.cleanup(sessionId);
      });

      // 连接超时 15s
      const connectTimeout = setTimeout(() => {
        failConnect(new AsrError("ASR connection timeout (15s)"));
        ws.close();
        this.cleanup(sessionId);
      }, 15000);
    });
  }

  /**
   * 发送音频数据块
   *
   * @param sessionId - session ID
   * @param chunk - 16kHz 16bit mono PCM 数据
   */
  sendAudioChunk(sessionId: string, chunk: Buffer): void {
    // 连接尚未建立时，缓冲 chunk，等 open 后 flush
    if (this.pendingSessions.has(sessionId)) {
      if (!this.pendingChunks.has(sessionId)) {
        this.pendingChunks.set(sessionId, []);
      }
      this.pendingChunks.get(sessionId)!.push(chunk);
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AsrError(`No ASR session found: ${sessionId}`);
    }

    session.seqNo++;
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_POS_SEQ, SERIAL_RAW, COMPRESS_NONE);
    const frame = buildFrame(header, chunk, session.seqNo);
    session.ws.send(frame);
  }

  /**
   * 停止识别并等待最终结果
   *
   * 发送负包（最后一包），等待服务端返回被 `is_final: true` 标记的最终识别文本。
   *
   * @returns 识别完成的完整文本
   */
  stopRecognition(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AsrError(`No ASR session found: ${sessionId}`);
    }

    logger.info(MODULE, `Stopping recognition`, { sessionId });

    // 发送负包（最后一包）
    const lastSeqNo = -(session.seqNo + 1);
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_NEG_SEQ, SERIAL_RAW, COMPRESS_NONE);
    const frame = buildFrame(header, Buffer.alloc(0), lastSeqNo);
    session.ws.send(frame);

    // 设置最终结果超时 15s
    session.resultTimeout = setTimeout(() => {
      if (session.resolveResult) {
        const err = new AsrError("ASR final result timeout (15s)");
        session.rejectResult?.(err);
        session.callbacks.onError(sessionId, err);
      }
      session.ws.close();
      this.cleanup(sessionId);
    }, 15000);

    return session.resultPromise;
  }

  /** 检查指定 session 是否已有活跃或正在建立的 ASR 连接 */
  hasActiveSession(sessionId: string): boolean {
    return this.sessions.has(sessionId) || this.pendingSessions.has(sessionId);
  }

  /** 主动关闭指定 session 的 ASR 连接 */
  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.ws.close();
      this.cleanup(sessionId);
    }
  }

  // ── Private ─────────────────────────────────────────

  /** 发送 Full Client Request（JSON 配置） */
  private sendFullClientRequest(session: AsrSession): void {
    const config = {
      audio: {
        format: "pcm",
        codec: "raw",
        rate: 16000,
        channel: 1,
      },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
        result_type: "single", // 增量返回，适合 partial 展示
      },
    };

    const json = Buffer.from(JSON.stringify(config), "utf-8");
    const header = buildHeader(MSG_FULL_REQUEST, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE);
    const frame = buildFrame(header, json);
    session.ws.send(frame);
  }

  /** 解析服务端返回的二进制帧 */
  private handleServerMessage(session: AsrSession, data: Buffer): void {
    const frame = parseFrame(data);

    // 处理错误帧
    if (frame.msgType === MSG_ERROR) {
      const errorText = extractJsonPayload(frame);
      logger.error(MODULE, `ASR server error`, {
        sessionId: session.sessionId,
        payload: errorText,
      });
      return;
    }

    if (frame.msgType !== MSG_SERVER_RESPONSE) {
      logger.debug(MODULE, `ASR non-response frame`, {
        sessionId: session.sessionId,
        msgType: frame.msgType,
        flags: frame.flags,
      });
      return;
    }

    const rawPayload = extractJsonPayload(frame);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      logger.warn(MODULE, `Non-JSON ASR response`, {
        sessionId: session.sessionId,
        raw: rawPayload.slice(0, 200),
      });
      return;
    }

    this.processResult(session, parsed, frame.flags);
  }

  /** 处理 ASR 识别结果 */
  private processResult(
    session: AsrSession,
    result: Record<string, unknown>,
    flags: number,
  ): void {
    // 豆包 bigmodel 返回结构: { result: { text, utterances: [{ text, definite, ... }] } }
    const resultBlock = result.result as Record<string, unknown> | undefined;
    const utterances = (resultBlock?.utterances ?? []) as Array<Record<string, unknown>>;

    for (const utt of utterances) {
      const uttText = (utt.text as string) ?? "";
      const isDefinite = Boolean(utt.definite); // 豆包用 definite 而非 is_final

      if (isDefinite) {
        session.accumulatedText += uttText;
      } else {
        session.partialText = uttText;
        session.callbacks.onPartial(session.sessionId, uttText);
      }
    }

    // 负包 flags (0b0011 = 3) 表示这是最后一帧 → 最终结果
    const isLastPacket = flags === FLAG_NEG_SEQ;

    if (isLastPacket && session.resolveResult) {
      if (session.resultTimeout) clearTimeout(session.resultTimeout);

      const finalText = session.accumulatedText || session.partialText;

      if (!finalText) {
        const err = new AsrError("No recognition result");
        session.rejectResult?.(err);
        session.callbacks.onError(session.sessionId, err);
      } else {
        logger.info(MODULE, `ASR final result`, {
          sessionId: session.sessionId,
          text: finalText.slice(0, 50),
        });
        session.callbacks.onFinal(session.sessionId, finalText);
        session.resolveResult(finalText);
      }

      session.resolveResult = null;
      session.rejectResult = null;
      session.ws.close();
    }
  }

  /** 清理 session 资源 */
  private cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.connectTimeout) clearTimeout(session.connectTimeout);
      if (session.resultTimeout) clearTimeout(session.resultTimeout);
    }
    this.sessions.delete(sessionId);
    this.pendingSessions.delete(sessionId);
    this.pendingChunks.delete(sessionId);
  }
}

/** 全局单例 */
export const doubaoAsr = new DoubaoAsrService();
