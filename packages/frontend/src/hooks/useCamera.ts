import { useRef, useState, useCallback, useEffect } from "react";

interface UseCameraOptions {
  /** 截图间隔 (ms)，默认 500 */
  interval?: number;
  /** 每次截图的回调 (base64 JPEG) */
  onFrame?: (base64: string) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** JPEG 质量 0-1，默认 0.8 */
  quality?: number;
  /** 最大宽度，超出等比缩放 */
  maxWidth?: number;
}

interface UseCameraReturn {
  /** 是否正在采集 */
  isCapturing: boolean;
  /** 最新一帧的 base64 */
  latestFrame: string | null;
  /** 权限/设备状态 */
  status: "idle" | "requesting" | "capturing" | "error" | "denied";
  /** 错误信息 */
  error: string | null;
  /** 视频流 (用于绑定到 <video> 元素显示预览) */
  stream: MediaStream | null;
  /** 开始采集 */
  start: () => Promise<void>;
  /** 停止采集 */
  stop: () => void;
}

/**
 * 摄像头采集 Hook（定时截图 base64 JPEG）
 *
 * 使用 getUserMedia 获取摄像头，隐藏 video 元素解码，
 * canvas 定时截图输出 base64 JPEG。
 */
export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const { interval = 500, onFrame, onError, quality = 0.8, maxWidth = 640 } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [status, setStatus] = useState<UseCameraReturn["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFrameRef = useRef(onFrame);
  const onErrorRef = useRef(onError);
  // React 19: 不能在 render 中写 ref.current，用 useEffect 同步
  useEffect(() => {
    onFrameRef.current = onFrame;
  });
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 等比缩放
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxWidth) {
      h = Math.round(h * (maxWidth / w));
      w = maxWidth;
    }
    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(video, 0, 0, w, h);
    const base64 = canvas.toDataURL("image/jpeg", quality);
    // 去掉 data:image/jpeg;base64, 前缀
    const pureBase64 = base64.split(",")[1] ?? base64;

    setLatestFrame(pureBase64);
    onFrameRef.current?.(pureBase64);
  }, [maxWidth, quality]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoRef.current = null;
    canvasRef.current = null;

    setIsCapturing(false);
    setStream(null);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("requesting");

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // 后置摄像头优先
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      const video = document.createElement("video");
      video.srcObject = mediaStream;
      video.playsInline = true;
      video.muted = true;

      await video.play();

      const canvas = document.createElement("canvas");

      streamRef.current = mediaStream;
      videoRef.current = video;
      canvasRef.current = canvas;

      setStream(mediaStream);
      setIsCapturing(true);
      setStatus("capturing");

      // 定时截图
      capture(); // 立即截取第一帧
      timerRef.current = setInterval(capture, interval);
    } catch (err) {
      const e = err as DOMException;
      const message = e.name === "NotAllowedError"
        ? "摄像头权限被拒绝"
        : e.name === "NotFoundError"
          ? "未检测到摄像头设备"
          : `摄像头初始化失败: ${e.message}`;

      setError(message);
      setStatus(e.name === "NotAllowedError" ? "denied" : "error");
      onErrorRef.current?.(new Error(message));
    }
  }, [interval, capture]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { isCapturing, latestFrame, status, error, stream, start, stop };
}
