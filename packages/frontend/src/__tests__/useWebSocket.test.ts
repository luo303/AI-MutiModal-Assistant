import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "../hooks/useWebSocket.js";

/** WebSocket 就绪状态常量 */
const WS = { CONNECTING: 0 as const, OPEN: 1 as const, CLOSING: 2 as const, CLOSED: 3 as const };

interface MockWSInstance {
  readyState: number;
  onopen: (() => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: ((e: Event) => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  _open(): void;
  _message(data: unknown): void;
  _close(code?: number): void;
}

function createMockWS(): MockWSInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: any = {};

  self.readyState = WS.CONNECTING;
  self.CONNECTING = WS.CONNECTING;
  self.OPEN = WS.OPEN;
  self.CLOSING = WS.CLOSING;
  self.CLOSED = WS.CLOSED;

  self.onopen = null;
  self.onclose = null;
  self.onmessage = null;
  self.onerror = null;

  self.send = vi.fn();
  self.close = vi.fn(function (this: MockWSInstance) {
    this.readyState = WS.CLOSED;
    this.onclose?.({ code: 1000 });
  });

  self._open = function () {
    this.readyState = WS.OPEN;
    this.onopen?.();
  };
  self._message = function (data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  };
  self._close = function (code = 1000) {
    this.readyState = WS.CLOSED;
    this.onclose?.({ code });
  };

  return self as MockWSInstance;
}

describe("useWebSocket", () => {
  let instance: MockWSInstance;

  beforeEach(() => {
    instance = createMockWS();
    const proto = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

    function MockWebSocket(this: Record<string, unknown>) {
      for (const key of Object.keys(instance)) {
        this[key] = instance[key as keyof MockWSInstance];
      }
      // 返回 mock 实例以覆盖 new 创建的 this
      return instance;
    }

    MockWebSocket.prototype = proto;
    Object.assign(MockWebSocket, proto);

    // 用 vi.fn 包装以支持断言
    globalThis.WebSocket = vi.fn(MockWebSocket) as unknown as typeof WebSocket;
    (globalThis.WebSocket as unknown as Record<string, number>).CONNECTING = WS.CONNECTING;
    (globalThis.WebSocket as unknown as Record<string, number>).OPEN = WS.OPEN;
    (globalThis.WebSocket as unknown as Record<string, number>).CLOSING = WS.CLOSING;
    (globalThis.WebSocket as unknown as Record<string, number>).CLOSED = WS.CLOSED;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("connect / disconnect", () => {
    it("connect 触发 new WebSocket，_open 后 readyState 变为 OPEN", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));

      act(() => {
        result.current.connect();
      });

      expect(globalThis.WebSocket).toHaveBeenCalledWith("ws://localhost/ws");
      expect(result.current.readyState).toBe(WS.CONNECTING);

      act(() => {
        instance._open();
      });

      expect(result.current.readyState).toBe(WS.OPEN);
    });

    it("disconnect 后 readyState 为 CLOSED", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));

      act(() => {
        result.current.connect();
        instance._open();
      });
      expect(result.current.readyState).toBe(WS.OPEN);

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.readyState).toBe(WS.CLOSED);
      expect(instance.close).toHaveBeenCalled();
    });

    it("autoConnect 在 mount 时自动连接", () => {
      renderHook(() => useWebSocket("ws://localhost/ws", { autoConnect: true }));
      expect(globalThis.WebSocket).toHaveBeenCalled();
    });

    it("不会重复连接 (已 OPEN)", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));

      act(() => {
        result.current.connect();
        instance._open();
      });

      const count = (globalThis.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        result.current.connect();
      });

      expect((globalThis.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(count);
    });
  });

  describe("send / on / off", () => {
    it("send 发送 JSON 消息", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));

      act(() => {
        result.current.connect();
        instance._open();
        result.current.send("session.start", {} as never);
      });

      expect(instance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "session.start", payload: {} }),
      );
    });

    it("未连接时 send 不会抛错", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));

      expect(() => {
        act(() => {
          result.current.send("session.start", {} as never);
        });
      }).not.toThrow();
    });

    it("on 订阅后收到消息触发 callback", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));
      const listener = vi.fn();

      act(() => {
        result.current.connect();
        instance._open();
        result.current.on("session.ready", listener);
        instance._message({
          type: "session.ready",
          payload: { sessionId: "abc" },
        });
      });

      expect(listener).toHaveBeenCalledWith({ sessionId: "abc" });
    });

    it("off 取消订阅后不再触发 callback", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));
      const listener = vi.fn();

      act(() => {
        result.current.connect();
        instance._open();
        result.current.on("asr.partial", listener);
        result.current.off("asr.partial", listener);
        instance._message({
          type: "asr.partial",
          payload: { sessionId: "abc", text: "hello" },
        });
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it("lastMessage 记录最新收到的消息", () => {
      const { result } = renderHook(() => useWebSocket("ws://localhost/ws"));

      act(() => {
        result.current.connect();
        instance._open();
        instance._message({
          type: "error",
          payload: { code: "TEST", message: "oops" },
        });
      });

      expect(result.current.lastMessage).toEqual({
        type: "error",
        payload: { code: "TEST", message: "oops" },
      });
    });
  });

  describe("reconnect", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("非手动 close 时自动重连", () => {
      const { result } = renderHook(() =>
        useWebSocket("ws://localhost/ws", {
          reconnectInterval: 3000,
          maxReconnectAttempts: 3,
        }),
      );

      act(() => {
        result.current.connect();
        instance._open();
      });

      expect((globalThis.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

      // 意外断开
      act(() => {
        instance._close();
      });

      // 推进重连间隔
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect((globalThis.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });

    it("手动 disconnect 不会重连", () => {
      const { result } = renderHook(() =>
        useWebSocket("ws://localhost/ws", { reconnectInterval: 1000 }),
      );

      act(() => {
        result.current.connect();
        instance._open();
        result.current.disconnect();
      });

      const count = (globalThis.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect((globalThis.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(count);
    });

    it("达到最大重连次数后停止", () => {
      const { result } = renderHook(() =>
        useWebSocket("ws://localhost/ws", {
          reconnectInterval: 1000,
          maxReconnectAttempts: 2,
        }),
      );

      act(() => {
        result.current.connect();
        instance._open();
      });

      // 断连 3 次
      for (let i = 0; i < 3; i++) {
        act(() => {
          instance._close();
          vi.advanceTimersByTime(1000);
        });
      }

      // 1 次初始 + 2 次重连 = 3 次
      expect((globalThis.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    });
  });
});
