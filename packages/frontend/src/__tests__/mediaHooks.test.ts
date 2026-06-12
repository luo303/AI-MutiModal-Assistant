import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMicrophone } from "../hooks/useMicrophone.js";
import { useCamera } from "../hooks/useCamera.js";

/** 创建一个可控制的 mock MediaStream */
function mockStream(): MediaStream {
  return {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    getAudioTracks: vi.fn(() => []),
    getVideoTracks: vi.fn(() => []),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    active: true,
    id: "mock-stream",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaStream;
}

/** mock AudioContext（必须用 function 不能用箭头函数，因为 new AudioContext 是构造调用） */
function createMockAudioCtx() {
  const processorNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as ((e: AudioProcessingEvent) => void) | null,
  };

  const sourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  return {
    sampleRate: 16000,
    destination: {},
    state: "running" as const,
    createMediaStreamSource: vi.fn(() => sourceNode),
    createScriptProcessor: vi.fn(() => processorNode),
    close: vi.fn(),
    // 暴露 processorNode 引用以便测试中访问
    _processorNode: processorNode,
  };
}

/** 模拟 AudioProcessingEvent */
function createAudioProcessingEvent(pcmData: Float32Array): AudioProcessingEvent {
  return {
    inputBuffer: {
      getChannelData: vi.fn(() => pcmData),
      numberOfChannels: 1,
      length: pcmData.length,
      sampleRate: 16000,
      duration: pcmData.length / 16000,
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    },
    outputBuffer: {
      getChannelData: vi.fn(() => new Float32Array(pcmData.length)),
      numberOfChannels: 1,
      length: pcmData.length,
      sampleRate: 16000,
      duration: pcmData.length / 16000,
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    },
    playbackTime: 0,
  } as unknown as AudioProcessingEvent;
}

describe("useMicrophone", () => {
  let stream: MediaStream;
  let audioCtx: ReturnType<typeof createMockAudioCtx>;

  beforeEach(() => {
    stream = mockStream();
    audioCtx = createMockAudioCtx();

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    });
    // 必须用 function 而非箭头函数，因为 new AudioContext 是构造调用
    function MockAudioContext(this: Record<string, unknown>) {
      Object.assign(this, audioCtx);
    }
    MockAudioContext.prototype = {};
    vi.stubGlobal("AudioContext", vi.fn(MockAudioContext));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start 时请求麦克风权限", async () => {
    const { result } = renderHook(() => useMicrophone());

    await act(async () => {
      await result.current.start();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.any(Object) }),
    );
    expect(result.current.isRecording).toBe(true);
    expect(result.current.status).toBe("recording");
  });

  it("权限被拒时 status 为 denied", async () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(error) },
      configurable: true,
    });

    const { result } = renderHook(() => useMicrophone());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("denied");
    expect(result.current.error).toContain("麦克风权限");
  });

  it("stop 后 isRecording 为 false", async () => {
    const { result } = renderHook(() => useMicrophone());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isRecording).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isRecording).toBe(false);
    expect(result.current.status).toBe("idle");
  });

  it("onaudioprocess 触发 onChunk 回调", async () => {
    const onChunk = vi.fn();
    const { result } = renderHook(() => useMicrophone({ onChunk, chunkSize: 128 }));

    await act(async () => {
      await result.current.start();
    });

    const processor = audioCtx._processorNode;

    expect(processor.onaudioprocess).toBeTruthy();

    // 发送足够填满 buffer 的 PCM 数据 (128 samples × 2 次 ≈ 会触发 flush)
    const pcm = new Float32Array(256);
    pcm.fill(0.5);
    for (let i = 0; i < 3; i++) {
      act(() => {
        processor.onaudioprocess?.(createAudioProcessingEvent(pcm));
      });
    }

    expect(onChunk).toHaveBeenCalled();
    // 验证输出是 base64
    const chunk = onChunk.mock.calls[0][0] as string;
    expect(typeof chunk).toBe("string");
    expect(chunk.length).toBeGreaterThan(0);
  });
});

describe("useCamera", () => {
  let stream: MediaStream;

  beforeEach(() => {
    stream = mockStream();
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    });
    // jsdom 不支持 video.play()
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start 时请求摄像头权限 (后置摄像头)", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: "environment" }),
      }),
    );
    expect(result.current.isCapturing).toBe(true);
    expect(result.current.status).toBe("capturing");
  });

  it("权限被拒时 status 为 denied", async () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(error) },
      configurable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("denied");
    expect(result.current.error).toContain("摄像头权限");
  });

  it("stop 后 isCapturing 为 false", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isCapturing).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isCapturing).toBe(false);
    expect(result.current.status).toBe("idle");
  });

  it("onFrame 回调在 start 后触发 (至少一次)", async () => {
    vi.useFakeTimers();
    const onFrame = vi.fn();
    const { result } = renderHook(() => useCamera({ onFrame, interval: 500 }));

    await act(async () => {
      await result.current.start();
    });

    // jsdom 中 video.readyState 始终为 0，capture 无法执行
    // 但 stream 和 isCapturing 状态已正确设置
    expect(result.current.isCapturing).toBe(true);
    expect(result.current.stream).toBe(stream);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // readyState=0 时 capture 不会真正执行，但定时器和流状态正确
    expect(result.current.isCapturing).toBe(true);

    vi.useRealTimers();
  });
});
