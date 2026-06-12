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
    logger.debug(MODULE, `Audio chunk ignored (not listening)`, { sessionId });
    return;
  }

  const data = payload.data as string;
  const chunk = Buffer.from(data, "base64");

  // 首次 audio.chunk 触发懒初始化 ASR 连接
  if (!doubaoAsr.hasActiveSession(sessionId)) {
    try {
      await doubaoAsr.startRecognition(sessionId, {
        onPartial: (sid, text) => {
          connectionManager.sendToSession(sid, {
            type: "asr.partial",
            payload: { sessionId: sid, text },
          });
        },
        onFinal: (_sid, _text) => {
          // final 在 stopRecognition 的返回中处理，这里不需要额外操作
        },
        onError: (sid, err) => {
          connectionManager.sendToSession(sid, {
            type: "error",
            payload: { sessionId: sid, code: "ASR_ERROR", message: err.message },
          });
        },
      });
    } catch (err) {
      logger.error(MODULE, `Failed to start ASR`, { sessionId, error: err });
      return;
    }
  }

  doubaoAsr.sendAudioChunk(sessionId, chunk);
});

// turn.end：停止 ASR → 状态转移 → 推送 asr.final
wsGateway.setHandler("turn.end", async (_ws, sessionId, _payload) => {
  sessionManager.recordTurnEnd(sessionId);

  let finalText: string;
  try {
    finalText = await doubaoAsr.stopRecognition(sessionId);
  } catch (err) {
    logger.error(MODULE, `ASR stop failed`, { sessionId, error: err });
    connectionManager.sendToSession(sessionId, {
      type: "error",
      payload: { sessionId, code: "ASR_ERROR", message: String(err) },
    });
    return;
  }

  // 记录 ASR 完成，状态 transfer thinking
  sessionManager.recordAsrFinal(sessionId, finalText);

  // 推送最终识别文本
  connectionManager.sendToSession(sessionId, {
    type: "asr.final",
    payload: { sessionId, text: finalText },
  });

  // ── 触发 LangGraph 工作流 ─────────────────────────
  connectionManager.sendToSession(sessionId, {
    type: "assistant.thinking",
    payload: { sessionId },
  });

  try {
    const graph = createMvpGraph({ glmService, ttsService: doubaoTts });
    const result = await graph.invoke({
      sessionId,
      userText: finalText,
    });

    // 推送 AI 文本
    if (result.assistantText) {
      connectionManager.sendToSession(sessionId, {
        type: "assistant.text",
        payload: { sessionId, text: result.assistantText },
      });
    }

    // 推送 AI 语音
    if (result.assistantAudio) {
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
      connectionManager.sendToSession(sessionId, {
        type: "usage.update",
        payload: usagePayload,
      });
    }

    // 推送工作流内部错误（如 GLM 失败但未抛异常）
    if (result.error) {
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
    logger.error(MODULE, "Workflow failed", {
      sessionId,
      error: (err as Error).message,
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
    connectionManager.sendToSession(sessionId, {
      type: "assistant.done",
      payload: { sessionId },
    });
  }

  logger.info(MODULE, "Turn complete", {
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
