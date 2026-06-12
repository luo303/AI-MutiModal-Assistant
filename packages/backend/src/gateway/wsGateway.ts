import { WebSocketServer, WebSocket } from "ws";
import { Server } from "node:http";
import { ClientEvent, ClientEventType } from "../types/events.js";
import { connectionManager } from "./connectionManager.js";
import { sessionManager } from "../session/sessionManager.js";
import { logger } from "../lib/logger.js";

const MODULE = "wsGateway";

type EventHandler = (
  ws: WebSocket,
  sessionId: string,
  payload: Record<string, unknown>,
) => Promise<void>;

/**
 * WebSocket Gateway
 *
 * 接收前端事件，路由分发到对应 handler。
 * 外部服务（ASR/TTS/GLM/Workflow）通过 setHandler / setExternalHandler 注入。
 */
class WsGateway {
  private wss: WebSocketServer | null = null;
  private handlers = new Map<ClientEventType, EventHandler>();

  constructor() {
    this.registerCoreHandlers();
  }

  /** 注册 Phase 2 的核心 handler（桩实现） */
  private registerCoreHandlers(): void {
    // session.start
    this.handlers.set("session.start", async (_ws, _sessionId, payload) => {
      const id = (payload.sessionId as string) ?? undefined;
      const session = sessionManager.createSession(id);
      connectionManager.add(session.id, _ws);
      connectionManager.sendToSession(session.id, {
        type: "session.ready",
        payload: { sessionId: session.id },
      });
    });

    // audio.chunk
    this.handlers.set("audio.chunk", async (_ws, sessionId, _payload) => {
      if (!sessionManager.canAcceptAudio(sessionId)) {
        logger.debug(MODULE, `Audio chunk ignored (not listening)`, { sessionId });
        return;
      }
      // TODO Phase 3: 转发给 doubaoAsr.sendAudioChunk()
      logger.debug(MODULE, `Audio chunk received`, { sessionId });
    });

    // frame.update
    this.handlers.set("frame.update", async (_ws, sessionId, payload) => {
      sessionManager.setLatestFrame(sessionId, payload.image as string);
      logger.debug(MODULE, `Frame updated`, { sessionId });
    });

    // turn.end
    this.handlers.set("turn.end", async (_ws, sessionId, _payload) => {
      sessionManager.recordTurnEnd(sessionId);
      // TODO Phase 3: doubaoAsr.stopRecognition(sessionId)
      logger.debug(MODULE, `Turn ended`, { sessionId });
    });

    // playback.done
    this.handlers.set("playback.done", async (_ws, sessionId, _payload) => {
      sessionManager.recordPlaybackDone(sessionId);
      logger.debug(MODULE, `Playback done`, { sessionId });
    });

    // session.stop
    this.handlers.set("session.stop", async (_ws, sessionId, _payload) => {
      sessionManager.closeSession(sessionId);
      connectionManager.remove(sessionId);
      logger.debug(MODULE, `Session stopped`, { sessionId });
    });
  }

  /** 允许外部覆盖 handler（Phase 3-6 接入真实服务） */
  setHandler(type: ClientEventType, handler: EventHandler): void {
    this.handlers.set(type, handler);
  }

  setup(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws) => {
      let sessionId: string | null = null;

      ws.on("message", async (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as ClientEvent;
          if (!msg.type) {
            this.sendError(ws, sessionId, "MISSING_TYPE", "Message type is required");
            return;
          }

          const handler = this.handlers.get(msg.type as ClientEventType);
          if (!handler) {
            this.sendError(ws, sessionId, "UNKNOWN_TYPE", `Unknown event type: ${msg.type}`);
            return;
          }

          // 从 payload 中提取 sessionId（除 session.start 外都需要）
          if (msg.type !== "session.start") {
            sessionId = (msg.payload as { sessionId?: string }).sessionId ?? sessionId;
            if (!sessionId) {
              this.sendError(ws, null, "NO_SESSION", "sessionId is required");
              return;
            }
          }

          await handler(ws, sessionId!, (msg.payload ?? {}) as Record<string, unknown>);
        } catch (err) {
          logger.error(MODULE, `Message handler error`, { error: err });
          this.sendError(ws, sessionId, "HANDLER_ERROR", String(err));
        }
      });

      ws.on("close", () => {
        if (sessionId) {
          connectionManager.remove(sessionId);
        }
      });

      ws.on("error", (err) => {
        logger.error(MODULE, `WebSocket error`, { error: err.message });
      });
    });

    logger.info(MODULE, `WebSocket gateway ready on path /ws`);
  }

  private sendError(ws: WebSocket, sessionId: string | null, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "error",
        payload: { sessionId, code, message },
      }));
    }
  }
}

export const wsGateway = new WsGateway();
