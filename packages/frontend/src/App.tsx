import { useRef, useEffect } from "react";
import { useMicrophone } from "./hooks/useMicrophone.js";
import { useCamera } from "./hooks/useCamera.js";

function App() {
  const mic = useMicrophone({ chunkSize: 2048 });
  const cam = useCamera({ interval: 1000 });
  const videoRef = useRef<HTMLVideoElement>(null);

  // 仅首次拿到 stream 时绑定 srcObject，避免每次 render 重设导致闪烁
  useEffect(() => {
    if (videoRef.current && cam.stream) {
      videoRef.current.srcObject = cam.stream;
    }
  }, [cam.stream]);

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: 20,
        fontFamily: "-apple-system, sans-serif",
      }}
    >
      <h2>🎤 麦克风测试</h2>
      <p>状态: {mic.status}</p>
      {mic.error && <p style={{ color: "red" }}>错误: {mic.error}</p>}
      <button onClick={mic.isRecording ? mic.stop : mic.start}>
        {mic.isRecording ? "⏹ 停止" : "🎙 开始"}
      </button>

      <hr style={{ margin: "20px 0" }} />

      <h2>📷 摄像头测试</h2>
      <p>状态: {cam.status}</p>
      <p>最新帧: {cam.latestFrame ? `${cam.latestFrame.length} chars` : "无"}</p>
      {cam.error && <p style={{ color: "red" }}>错误: {cam.error}</p>}
      <button onClick={cam.isCapturing ? cam.stop : cam.start}>
        {cam.isCapturing ? "⏹ 停止" : "📸 开始"}
      </button>
      {cam.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "100%", marginTop: 10, borderRadius: 8 }}
        />
      )}
    </main>
  );
}

export default App;
