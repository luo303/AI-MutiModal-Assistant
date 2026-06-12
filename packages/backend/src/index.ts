import { Buffer } from "node:buffer";
import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { wsGateway } from "./gateway/wsGateway.js";
import { connectionManager } from "./gateway/connectionManager.js";
import { sessionManager } from "./session/sessionManager.js";
import { doubaoAsr } from "./services/doubaoAsr.js";
import { glmService } from "./services/glmService.js";
import { doubaoTts } from "./services/doubaoTts.js";
import { usageRecorder } from "./services/usageRecorder.js";
import { createMvpGraph } from "./workflow/graph.js";
import { errorHandler } from "./middleware/errorHandler.js";
import healthRouter from "./routes/health.js";

const MODULE = "server";

const app = express();
const server = createServer(app);

// ── HTTP 中间件 ──────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── HTTP 路由 ────────────────────────────────────────
app.use(healthRouter);

// ── WebSocket 网关 ────────────────────────────────────
wsGateway.setup(server);

// ── 接入豆包 ASR 服务（覆盖 Phase 2 的桩 handler） ──────

// audio.chunk：解码 base64 → PCM → 转发给 ASR
wsGateway.setHandler("audio.chunk", async (_ws, sessionId, payload) => {
  if (!sessionManager.canAcceptAudio(sessionId)) {
    logger.warn(MODULE, `[audio.chunk] 拒绝：session 不在 listening 状态`, {
      sessionId,
      state: sessionManager.getState(sessionId),
    });
    return;
  }

  const data = payload.data as string;
  const chunk = Buffer.from(data, "base64");
  logger.info(MODULE, `[audio.chunk] 收到音频块`, {
    sessionId,
    chunkBytes: chunk.length,
  });

  // 首次 audio.chunk 触发懒初始化 ASR 连接
  if (!doubaoAsr.hasActiveSession(sessionId)) {
    logger.info(MODULE, `[audio.chunk] 首次触发 ASR 连接初始化`, { sessionId });
    try {
      await doubaoAsr.startRecognition(sessionId, {
        onPartial: (sid, text) => {
          logger.info(MODULE, `[ASR] partial → 推送 asr.partial`, { sessionId: sid, text: text.slice(0, 30) });
          connectionManager.sendToSession(sid, {
            type: "asr.partial",
            payload: { sessionId: sid, text },
          });
        },
        onFinal: (_sid, _text) => {
          // final 在 stopRecognition 的返回中处理，这里不需要额外操作
        },
        onError: (sid, err) => {
          logger.error(MODULE, `[ASR] onError 回调`, { sessionId: sid, error: err.message });
          connectionManager.sendToSession(sid, {
            type: "error",
            payload: { sessionId: sid, code: "ASR_ERROR", message: err.message },
          });
        },
      });
      logger.info(MODULE, `[audio.chunk] ASR 连接已建立`, { sessionId });
    } catch (err) {
      logger.error(MODULE, `[audio.chunk] ASR 启动失败`, { sessionId, error: err });
      return;
    }
  }

  doubaoAsr.sendAudioChunk(sessionId, chunk);
});

// turn.end：停止 ASR → 状态转移 → 推送 asr.final
wsGateway.setHandler("turn.end", async (_ws, sessionId, _payload) => {
  logger.info(MODULE, `[turn.end] ========== 收到 turn.end，开始处理 ==========`, { sessionId });
  sessionManager.recordTurnEnd(sessionId);

  // Step 1: 停止 ASR 并等待最终结果
  logger.info(MODULE, `[turn.end] Step1: 调用 stopRecognition...`, { sessionId });
  let finalText: string;
  try {
    finalText = await doubaoAsr.stopRecognition(sessionId);
    logger.info(MODULE, `[turn.end] Step1 完成: ASR 最终结果`, {
      sessionId,
      text: finalText.slice(0, 50),
      textLen: finalText.length,
    });
  } catch (err) {
    logger.error(MODULE, `[turn.end] Step1 失败: ASR stop`, { sessionId, error: err });
    connectionManager.sendToSession(sessionId, {
      type: "error",
      payload: { sessionId, code: "ASR_ERROR", message: String(err) },
    });
    // ASR 失败也要通知前端本轮结束，防止卡死
    connectionManager.sendToSession(sessionId, {
      type: "assistant.done",
      payload: { sessionId },
    });
    logger.info(MODULE, `[turn.end] ========== 异常结束(ASR失败) ==========`, { sessionId });
    return;
  }

  // Step 2: 记录 ASR 完成，推送 asr.final
  logger.info(MODULE, `[turn.end] Step2: 推送 asr.final + assistant.thinking`, { sessionId });
  sessionManager.recordAsrFinal(sessionId, finalText);

  connectionManager.sendToSession(sessionId, {
    type: "asr.final",
    payload: { sessionId, text: finalText },
  });

  connectionManager.sendToSession(sessionId, {
    type: "assistant.thinking",
    payload: { sessionId },
  });

  // Step 3: 运行 LangGraph 工作流
  logger.info(MODULE, `[turn.end] Step3: 启动 LangGraph 工作流`, { sessionId });
  try {
    const graph = createMvpGraph({ glmService, ttsService: doubaoTts });
    const result = await graph.invoke({
      sessionId,
      userText: finalText,
    });

    logger.info(MODULE, `[turn.end] Step3 工作流完成，开始推送结果`, {
      sessionId,
      hasText: !!result.assistantText,
      hasAudio: !!result.assistantAudio,
      hasError: !!result.error,
    });

    // 推送 AI 文本
    if (result.assistantText) {
      logger.info(MODULE, `[turn.end] 推送 assistant.text`, {
        sessionId,
        textLen: result.assistantText.length,
      });
      connectionManager.sendToSession(sessionId, {
        type: "assistant.text",
        payload: { sessionId, text: result.assistantText },
      });
    }

    // 推送 AI 语音
    if (result.assistantAudio) {
      logger.info(MODULE, `[turn.end] 推送 assistant.audio`, {
        sessionId,
        audioBytes: result.assistantAudio.length,
      });
      connectionManager.sendToSession(sessionId, {
        type: "assistant.audio",
        payload: {
          sessionId,
          data: result.assistantAudio.toString("base64"),
        },
      });
    }

    // 推送用量
    const usagePayload = usageRecorder.toPayload(sessionId);
    if (usagePayload) {
      logger.info(MODULE, `[turn.end] 推送 usage.update`, { sessionId, usage: usagePayload });
      connectionManager.sendToSession(sessionId, {
        type: "usage.update",
        payload: usagePayload,
      });
    }

    // 推送工作流内部错误（如 GLM 失败但未抛异常）
    if (result.error) {
      logger.error(MODULE, `[turn.end] 工作流内部错误`, {
        sessionId,
        error: result.error,
      });
      connectionManager.sendToSession(sessionId, {
        type: "error",
        payload: {
          sessionId,
          code: "WORKFLOW_ERROR",
          message: result.error,
        },
      });
    }
  } catch (err) {
    logger.error(MODULE, `[turn.end] 工作流异常`, {
      sessionId,
      error: (err as Error).message,
      stack: (err as Error).stack?.slice(0, 300),
    });
    connectionManager.sendToSession(sessionId, {
      type: "error",
      payload: {
        sessionId,
        code: "WORKFLOW_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  } finally {
    logger.info(MODULE, `[turn.end] Step4: 推送 assistant.done`, { sessionId });
    connectionManager.sendToSession(sessionId, {
      type: "assistant.done",
      payload: { sessionId },
    });
  }

  logger.info(MODULE, `[turn.end] ========== 处理完成 ==========`, {
    sessionId,
    text: finalText.slice(0, 50),
  });
});

// ── 错误处理（必须放在最后） ──────────────────────────
app.use(errorHandler);

// ── 启动 ─────────────────────────────────────────────
server.listen(env.PORT, () => {
  logger.info(MODULE, `Backend listening on http://localhost:${env.PORT}`);
  logger.info(MODULE, `WebSocket ready on ws://localhost:${env.PORT}/ws`);
});

export { app, server };
