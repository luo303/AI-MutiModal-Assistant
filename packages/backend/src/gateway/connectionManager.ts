import { WebSocket } from "ws";
import { ServerEvent, ServerEventType } from "../types/events.js";
import { logger } from "../lib/logger.js";

const MODULE = "connectionManager";

/**
 * WebSocket 连接管理器（单例）
 * 管理每个 session 对应的 WebSocket 连接
 */
class ConnectionManager {
  private connections = new Map<string, WebSocket>();

  add(sessionId: string, ws: WebSocket): void {
    this.connections.set(sessionId, ws);
    logger.info(MODULE, `Connection added`, { sessionId, total: this.connections.size });
  }

  remove(sessionId: string): void {
    this.connections.delete(sessionId);
    logger.info(MODULE, `Connection removed`, { sessionId, total: this.connections.size });
  }

  get(sessionId: string): WebSocket | undefined {
    return this.connections.get(sessionId);
  }

  /** 向指定 session 发送事件 */
  sendToSession<T extends ServerEventType>(
    sessionId: string,
    event: ServerEvent<T>,
  ): void {
    const ws = this.connections.get(sessionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      logger.warn(MODULE, `[SEND] ⚠️ 无法发送，连接未就绪`, {
        sessionId,
        event: event.type,
        hasWs: !!ws,
        readyState: ws?.readyState,
      });
      return;
    }
    try {
      ws.send(JSON.stringify(event));
      logger.info(MODULE, `[SEND] → ${event.type}`, { sessionId });
    } catch (err) {
      logger.error(MODULE, `[SEND] ❌ 发送失败`, { sessionId, event: event.type, error: err });
    }
  }

  /** 广播事件到所有连接的 session */
  broadcast<T extends ServerEventType>(event: ServerEvent<T>): void {
    for (const [sessionId] of this.connections) {
      this.sendToSession(sessionId, event);
    }
  }
}

export const connectionManager = new ConnectionManager();
