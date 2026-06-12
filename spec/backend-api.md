# 后端 API 接口文档

## 1. 架构总览

```
 ┌──────────────┐    WebSocket (ws://localhost:3001/ws)    ┌──────────┐
 │   前端 React  │ ◄──────────────────────────────────────► │  后端     │
 │   :5173       │       JSON { type, payload }             │  :3001   │
 └──────────────┘                                          └──────────┘
                                                               │
                        HTTP GET /api/health                    │
                                                               │
                          ┌────────────────────────────────────┤
                          │  豆包 ASR  │  GLM-4V  │  豆包 TTS  │
                          └────────────────────────────────────┘
```

| 项目 | 值 |
|---|---|
| WebSocket 路径 | `ws://localhost:3001/ws` |
| 健康检查 | `GET http://localhost:3001/api/health` |
| 消息格式 | JSON `{ "type": "...", "payload": {...} }` |
| 协议模型 | 半双工：说话时不能听，播放时不能说 |

---

## 2. 会话状态机

```
 idle ──(session.start)──► listening ◄──────────────────────┐
                              │                              │
                       (turn.end)                      (playback.done)
                              │                              │
                              ▼                              │
                        transcribing                         │
                              │                              │
                       (asr.final)                           │
                              │                              │
                              ▼                              │
                          thinking                           │
                              │                              │
                     (assistant.audio)                       │
                              │                              │
                              ▼                              │
                          speaking ──────────────────────────┘

               任意状态 ──(session.stop)──► closed
```

| 状态 | 含义 | 允许的操作 |
|---|---|---|
| `idle` | 初始状态 | 只能 `session.start` |
| `listening` | 等待用户说话 | `audio.chunk`、`frame.update`、`turn.end` |
| `transcribing` | ASR 识别中 | 等待 `asr.final` |
| `thinking` | AI 思考中 | 等待 `assistant.text`/`assistant.audio` |
| `speaking` | AI 播放语音中 | 等待用户发起 `playback.done` |
| `closed` | 会话结束 | 无 |

---

## 3. 消息交互时序（一轮对话）

```
前端                                        后端
 │                                           │
 │── session.start ─────────────────────►     │  ① 创建会话
 │ ◄───────────────────────── session.ready  │
 │                                           │
 │── frame.update (图片) ──────────────►     │  ② 发送摄像头帧
 │                                           │
 │── audio.chunk (PCM base64) ────────►      │  ③ 流式发送音频
 │── audio.chunk ────────────────────►       │
 │── audio.chunk ────────────────────►       │
 │ ◄───────────────────────── asr.partial    │  ④ 实时识别中间结果
 │ ◄───────────────────────── asr.partial    │
 │                                           │
 │── turn.end ────────────────────────►      │  ⑤ 说话结束
 │ ◄────────────────────────── asr.final     │  ⑥ 最终识别文本
 │ ◄──────────────────── assistant.thinking  │  ⑦ AI 开始处理
 │ ◄─────────────────────── assistant.text   │  ⑧ AI 文本回复
 │ ◄────────────────────── assistant.audio   │  ⑨ TTS 语音 (base64 MP3)
 │ ◄─────────────────────── usage.update     │  ⑩ 用量统计
 │ ◄───────────────────── assistant.done     │  ⑪ 本轮结束
 │                                           │
 │── playback.done ───────────────────►      │  ⑫ 播放完毕，回到 listening
 │                                           │
 │── session.stop ────────────────────►      │  ⑬ 结束会话
```

---

## 4. 客户端 → 服务端事件（6 个）

### 4.1 `session.start`

创建新会话。**这是唯一不需要 `sessionId` 的消息。**

```json
{
  "type": "session.start",
  "payload": {}
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `payload.sessionId` | `string?` | 否 | 不传则自动生成 UUID |

**服务端响应**：`session.ready`

---

### 4.2 `audio.chunk`

发送麦克风采集的 PCM 音频数据。

```json
{
  "type": "audio.chunk",
  "payload": {
    "sessionId": "uuid-xxx",
    "data": "base64编码的PCM音频..."
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `payload.sessionId` | `string` | 是 | 会话 ID |
| `payload.data` | `string` | 是 | Base64 编码的 PCM 16kHz 16bit 单声道音频 |

**注意**：第一个 `audio.chunk` 会触发服务端懒初始化豆包 ASR 连接。仅 `listening` 状态下接受。

**服务端可能推送**：`asr.partial`

---

### 4.3 `frame.update`

发送摄像头截图帧，AI 将看到这张图片。

```json
{
  "type": "frame.update",
  "payload": {
    "sessionId": "uuid-xxx",
    "image": "base64编码的JPEG图片..."
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `payload.sessionId` | `string` | 是 | 会话 ID |
| `payload.image` | `string` | 是 | Base64 编码的 JPEG 图片 |

**无响应事件**。服务端只存储最新一帧，每次覆盖前一次。

---

### 4.4 `turn.end`

用户说话结束。触发 ASR stop → LangGraph 工作流 → 依次推送结果。

```json
{
  "type": "turn.end",
  "payload": { "sessionId": "uuid-xxx" }
}
```

**服务端依次推送**：`asr.final` → `assistant.thinking` → `assistant.text` → `assistant.audio` → `usage.update` → `assistant.done`

---

### 4.5 `playback.done`

告知服务端 AI 语音播放完毕，状态回到 `listening`。

```json
{
  "type": "playback.done",
  "payload": { "sessionId": "uuid-xxx" }
}
```

**无响应事件**。状态转移：`speaking` → `listening`。

---

### 4.6 `session.stop`

结束会话，释放资源。

```json
{
  "type": "session.stop",
  "payload": { "sessionId": "uuid-xxx" }
}
```

**无响应事件**。状态转移：任意 → `closed`。

---

## 5. 服务端 → 客户端事件（9 个）

### 5.1 `session.ready`

```json
{ "type": "session.ready", "payload": { "sessionId": "uuid-xxx" } }
```

---

### 5.2 `asr.partial`

```json
{ "type": "asr.partial", "payload": { "sessionId": "uuid-xxx", "text": "今天天气" } }
```

ASR 实时识别中间结果，**会多次推送**。

---

### 5.3 `asr.final`

```json
{ "type": "asr.final", "payload": { "sessionId": "uuid-xxx", "text": "今天天气怎么样" } }
```

ASR 最终识别文本，**只推送一次**。

---

### 5.4 `assistant.thinking`

```json
{ "type": "assistant.thinking", "payload": { "sessionId": "uuid-xxx" } }
```

AI 开始处理，前端可显示"思考中..."。

---

### 5.5 `assistant.text`

```json
{ "type": "assistant.text", "payload": { "sessionId": "uuid-xxx", "text": "今天天气不错。" } }
```

GLM-4V 的文本回复。

---

### 5.6 `assistant.audio`

```json
{ "type": "assistant.audio", "payload": { "sessionId": "uuid-xxx", "data": "base64...", "format": "mp3" } }
```

豆包 TTS 合成的语音 Base64。`format` 默认 `"mp3"`。

---

### 5.7 `usage.update`

```json
{ "type": "usage.update", "payload": { "sessionId": "uuid-xxx", "asrCalls": 1, "glmCalls": 2, "ttsCalls": 2, "totalTurns": 2 } }
```

当前会话累计用量，每轮结束后推送一次。

---

### 5.8 `assistant.done`

```json
{ "type": "assistant.done", "payload": { "sessionId": "uuid-xxx" } }
```

本轮结束信号（finally 块发送，无论成功失败）。前端收到后可播放语音、恢复录音。

---

### 5.9 `error`

```json
{ "type": "error", "payload": { "sessionId": "uuid-xxx", "code": "ASR_ERROR", "message": "timeout" } }
```

| 错误码 | 说明 |
|---|---|
| `ASR_ERROR` | 语音识别失败 |
| `WORKFLOW_ERROR` | AI 处理流程失败 |
| `MISSING_TYPE` | 缺少 type 字段 |
| `UNKNOWN_TYPE` | 未知消息类型 |
| `NO_SESSION` | 缺少 sessionId |
| `HANDLER_ERROR` | 处理异常 |

---

## 6. HTTP 端点

### `GET /api/health`

```json
{ "status": "ok", "timestamp": "2026-06-12T10:30:00.000Z" }
```

---

## 7. 前端参考

### 连接

```typescript
const ws = new WebSocket("ws://localhost:3001/ws");
// Vite 代理：开发模式下直接用 "/ws" 也可
```

### 发消息

```typescript
ws.send(JSON.stringify({ type: "session.start", payload: {} }));
```

### 收消息

```typescript
ws.onmessage = (event) => {
  const { type, payload } = JSON.parse(event.data);
  switch (type) {
    case "session.ready":  /* 保存 payload.sessionId */   break;
    case "asr.partial":    /* 显示 payload.text */         break;
    case "asr.final":      /* 显示最终识别 */              break;
    case "assistant.thinking": /* 思考动画 */              break;
    case "assistant.text": /* 显示 AI 回复 */              break;
    case "assistant.audio": /* 播放 payload.data */        break;
    case "usage.update":   /* 更新用量 */                  break;
    case "assistant.done": /* 恢复录音按钮 */              break;
    case "error":          /* 显示 payload.message */      break;
  }
};
```

### 播放 Base64 MP3

```typescript
function playAudio(base64: string) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "audio/mp3" });
  const audio = new Audio(URL.createObjectURL(blob));
  audio.onended = () => ws.send(JSON.stringify({
    type: "playback.done", payload: { sessionId },
  }));
  audio.play();
}
```
