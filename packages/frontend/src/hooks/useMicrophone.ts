import { useRef, useState, useCallback, useEffect } from "react";

interface UseMicrophoneOptions {
  /** 音频 chunk 回调 (base64 PCM 16kHz 16bit mono) */
  onChunk?: (chunk: string) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 采样率，默认 16000 */
  sampleRate?: number;
  /** chunk 大小 (采样点数)，默认 4096，约每 256ms 触发一次 */
  chunkSize?: number;
}

interface UseMicrophoneReturn {
  /** 是否正在录音 */
  isRecording: boolean;
  /** 权限/设备状态 */
  status: "idle" | "requesting" | "recording" | "error" | "denied";
  /** 错误信息 */
  error: string | null;
  /** 开始录音 */
  start: () => Promise<void>;
  /** 停止录音 */
  stop: () => void;
}

/**
 * 麦克风采集 Hook（PCM 16kHz 16bit mono）
 *
 * 使用 AudioContext + ScriptProcessorNode 将浏览器麦克风输入
 * 重采样为 16kHz 16bit PCM 数据，通过 onChunk 回调输出 base64。
 */
export function useMicrophone(options: UseMicrophoneOptions = {}): UseMicrophoneReturn {
  const { onChunk, onError, sampleRate = 16000, chunkSize = 4096 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<UseMicrophoneReturn["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bufferRef = useRef<Int16Array>(new Int16Array(chunkSize));
  const bufferOffsetRef = useRef(0);
  const onChunkRef = useRef(onChunk);
  const onErrorRef = useRef(onError);
  // React 19: 不能在 render 中写 ref.current，用 useEffect 同步
  useEffect(() => {
    onChunkRef.current = onChunk;
  });
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const flushBuffer = useCallback(() => {
    if (bufferOffsetRef.current === 0) return;
    const chunk = bufferRef.current.slice(0, bufferOffsetRef.current);
    bufferOffsetRef.current = 0;

    // 转 base64
    const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    onChunkRef.current?.(btoa(binary));
  }, []);

  const stop = useCallback(() => {
    console.trace("[useMicrophone] stop() 被调用，调用栈如下：");
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    ctxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    processorRef.current = null;
    sourceRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;

    setIsRecording(false);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: sampleRate },
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const ctx = new AudioContext({ sampleRate });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(1024, 1, 1);

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0); // Float32 [-1, 1]
        const rateRatio = ctx.sampleRate / sampleRate;
        const step = Math.max(1, Math.round(rateRatio));

        for (let i = 0; i < input.length; i += step) {
          // Float32 → Int16
          const sample = Math.max(-1, Math.min(1, input[i]));
          bufferRef.current[bufferOffsetRef.current] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

          bufferOffsetRef.current += 1;
          if (bufferOffsetRef.current >= chunkSize) {
            flushBuffer();
          }
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination); // ScriptProcessor 必须连接到 destination 才能触发 onaudioprocess

      streamRef.current = stream;
      ctxRef.current = ctx;
      sourceRef.current = source;
      processorRef.current = processor;

      setIsRecording(true);
      setStatus("recording");
    } catch (err) {
      const e = err as DOMException;
      const message = e.name === "NotAllowedError"
        ? "麦克风权限被拒绝"
        : e.name === "NotFoundError"
          ? "未检测到麦克风设备"
          : `麦克风初始化失败: ${e.message}`;

      setError(message);
      setStatus(e.name === "NotAllowedError" ? "denied" : "error");
      onErrorRef.current?.(new Error(message));
    }
  }, [sampleRate, chunkSize, flushBuffer]);

  return { isRecording, status, error, start, stop };
}
