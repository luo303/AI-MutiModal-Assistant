/**
 * CSS @keyframes 字符串 — 供 inline style 中的 animation 属性引用
 *
 * 以模块导出确保只定义一次，避免每个组件重复注入 <style>。
 */

/** 三点跳动（ThinkingIndicator） */
export const keyframes = {
  dotPulse: "dotPulse",
} as const;

// 注入 <style> 到 <head>
let injected = false;

export function injectKeyframes(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes dotPulse {
      0%, 80%, 100% {
        transform: scale(0.6);
        opacity: 0.4;
      }
      40% {
        transform: scale(1);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}
