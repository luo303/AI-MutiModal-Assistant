import { useRef, useEffect } from "react";

interface CameraPreviewProps {
  stream: MediaStream | null;
  muted?: boolean;
}

/**
 * 摄像头预览组件 — 将 MediaStream 渲染到 <video> 元素
 *
 * 使用 useRef + useEffect 一次性绑定 srcObject，避免每次 render 重设导致闪烁。
 */
export function CameraPreview({ stream, muted = true }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "4 / 3",
          backgroundColor: "var(--color-bg-card)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-muted)",
          fontSize: 14,
        }}
      >
        📷 摄像头未开启
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      style={{
        width: "100%",
        aspectRatio: "4 / 3",
        objectFit: "cover",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "#000",
      }}
    />
  );
}
