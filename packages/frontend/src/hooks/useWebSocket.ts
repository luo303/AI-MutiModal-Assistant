import { useRef, useState, useCallback, useEffect } from "react";
import type { ClientEvent, ClientEventType, ServerEvent, ServerEventMap, ServerEventType } from "../types/events.js";

type Listener = (payload: ServerEvent["payload"]) => void;

interface UseWebSocketOptions {
  /** 自动连接 */
  autoConnect?: boolean;
  /** 重连间隔 (ms)，默认 3000；设为 0 禁用 */
  reconnectInterval?: number;
  /** 最大重连次数，默认 5；设为 0 无限重连 */
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  /** 当前连接状态 (对应 WebSocket.readyState) */
  readyState: number;
  /** 最新收到的服务端消息 */
  lastMessage: ServerEvent | null;
  /** 建立连接 */
  connect: () => void;
  /** 断开连接 */
  disconnect: () => void;
  /** 发送客户端事件 */
  send: <T extends ClientEventType>(type: T, payload: ClientEvent["payload"]) => void;
  /** 订阅指定类型的服务端事件 */
  on: <T extends ServerEventType>(type: T, listener: (payload: ServerEventMap[T]) => void) => void;
  /** 取消订阅 */
  off: <T extends ServerEventType>(type: T, listener: (payload: ServerEventMap[T]) => void) => void;
}

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const { autoConnect = false, reconnectInterval = 3000, maxReconnectAttempts = 5 } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Map<string, Set<Listener>>());
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);

  // 用 ref 保存最新 connect，避免 onclose 闭包中递归引用自身的 stale closure 问题
  const connectRef = useRef<() => void>(() => {});
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED);
  const [lastMessage, setLastMessage] = useState<ServerEvent | null>(null);

  /** 清理重连定时器 */
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  /** 断开连接 */
  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    clearReconnectTimer();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setReadyState(WebSocket.CLOSED);
  }, [clearReconnectTimer]);

  /** 建立连接 */
  const connect = useCallback(() => {
    // 避免重复连接
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    manualCloseRef.current = false;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setReadyState(WebSocket.CONNECTING);

    ws.onopen = () => {
      console.log("[useWebSocket] 连接已建立", url);
      setReadyState(WebSocket.OPEN);
      reconnectCountRef.current = 0;
    };

    ws.onclose = () => {
      console.log("[useWebSocket] 连接已关闭", url);
      setReadyState(WebSocket.CLOSED);

      // 非手动关闭且重连未达上限，则自动重连
      if (!manualCloseRef.current && reconnectInterval > 0) {
        const maxed = maxReconnectAttempts > 0 && reconnectCountRef.current >= maxReconnectAttempts;
        if (!maxed) {
          reconnectCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            connectRef.current();
          }, reconnectInterval);
        }
      }
    };

    ws.onerror = () => {
      // onclose 会在 onerror 后触发，重连逻辑放在 onclose 中
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerEvent;
        console.log("[useWebSocket] RECV", msg.type, msg.payload);
        setLastMessage(msg);

        // 通知所有订阅该类型的 listener
        const typeListeners = listenersRef.current.get(msg.type);
        if (typeListeners) {
          typeListeners.forEach((fn) => fn(msg.payload));
        }
      } catch {
        console.warn("[useWebSocket] 收到非JSON消息，已忽略");
      }
    };
  }, [url, reconnectInterval, maxReconnectAttempts]);

  // 同步 ref，供 onclose 中的 setTimeout 安全调用最新 connect
  useEffect(() => {
    connectRef.current = connect;
  });

  /** 发送消息 */
  const send = useCallback(<T extends ClientEventType>(type: T, payload: ClientEvent["payload"]) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
      console.log("[useWebSocket] SEND", type, payload);
    } else {
      console.warn("[useWebSocket] ⚠️ 消息被丢弃(ws未OPEN)", {
        type,
        readyState: ws?.readyState ?? "null",
        readyStateLabel: ws ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][ws.readyState] : "no-websocket",
      });
    }
  }, []);

  /** 订阅事件 */
  const on = useCallback(<T extends ServerEventType>(
    type: T,
    listener: (payload: ServerEventMap[T]) => void,
  ) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(listener as Listener);
  }, []);

  /** 取消订阅 */
  const off = useCallback(<T extends ServerEventType>(
    type: T,
    listener: (payload: ServerEventMap[T]) => void,
  ) => {
    listenersRef.current.get(type)?.delete(listener as Listener);
  }, []);

  // autoConnect
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  return { readyState, lastMessage, connect, disconnect, send, on, off };
}
