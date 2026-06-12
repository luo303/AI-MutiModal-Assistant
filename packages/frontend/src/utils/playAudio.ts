/**
 * 播放 Base64 编码的 MP3 音频
 *
 * 将 base64 字符串解码为二进制 → Blob → Object URL → Audio 元素播放。
 * 返回 Promise，播放结束时 resolve（用于触发 playback.done）。
 *
 * @param base64 - Base64 编码的 MP3 音频数据
 * @param onEnd   - 播放结束回调（可选）
 * @param onError - 播放错误回调（可选）
 * @returns 清理函数（可用于中途停止播放）
 */
export function playAudio(
  base64: string,
  onEnd?: () => void,
  onError?: (err: Error) => void,
): () => void {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "audio/mp3" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  // 播放结束：释放 Object URL，触发回调
  audio.onended = () => {
    URL.revokeObjectURL(url);
    onEnd?.();
  };

  audio.onerror = () => {
    URL.revokeObjectURL(url);
    onError?.(new Error("音频播放失败"));
  };

  audio.play().catch((err) => {
    URL.revokeObjectURL(url);
    onError?.(err instanceof Error ? err : new Error(String(err)));
  });

  // 返回清理函数（用户可中途停止）
  return () => {
    audio.pause();
    audio.currentTime = 0;
    URL.revokeObjectURL(url);
  };
}
