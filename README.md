# AI 视觉对话助手

AI 视觉对话助手是一个 MVP 阶段的多模态语音交互项目，目标是在浏览器中打通“摄像头画面 + 用户语音 -> AI 多模态理解 -> 文本与语音回复”的最小闭环。

用户授权摄像头和麦克风后，前端采集语音与当前画面，通过 WebSocket 发送到 Node.js 后端。后端调用豆包流式语音识别获取用户文本，使用 LangGraph 编排对话流程，结合 GLM-5V-Turbo 生成多模态回答，再通过豆包语音合成返回音频，由前端播放。

## MVP 功能

- 摄像头预览与当前画面截图
- 麦克风采集与音频片段上传
- 基于 WebSocket 的前后端实时通信
- 豆包流式 ASR 语音识别
- LangGraph 最小 AI 工作流编排
- GLM-5V-Turbo 图文多模态理解
- 豆包 TTS 语音合成
- 前端展示用户文本、AI 文本并播放 AI 语音
- 每轮基础用量记录

## 交互模式

项目采用半双工语音交互：

```text
用户说话
-> 前端上传音频和当前截图
-> 后端识别语音并生成 AI 回复
-> 前端暂停录音并播放 AI 语音
-> 播放完成后恢复录音
```

MVP 阶段暂不支持用户打断 AI。AI 播放期间，前端不会继续上传音频，后端也会忽略 `speaking` 状态下收到的 `audio.chunk`。

## 总体架构

```text
浏览器前端
  - 摄像头预览
  - 麦克风采集
  - 半双工状态控制
  - WebSocket 客户端
  - 对话与状态展示
  - AI 音频播放

Node.js 后端
  - WebSocket Gateway
  - Session Manager
  - 豆包 ASR Service
  - Frame Store
  - LangGraph Workflow
  - GLM Service
  - 豆包 TTS Service
  - Usage Recorder
```

核心链路：

```text
浏览器摄像头 + 麦克风
-> 前端 listening 状态上传音频和当前截图
-> Node.js 后端接收
-> 豆包流式 ASR 转文字
-> LangGraph 编排
-> GLM-5V-Turbo 多模态回答
-> 豆包 TTS 合成语音
-> 前端 speaking 状态播放语音
-> 播放完成后恢复 listening 状态
```

## 实时通信事件

前端发送：

| 事件 | 说明 |
|---|---|
| `session.start` | 开始会话 |
| `audio.chunk` | 上传用户音频片段 |
| `frame.update` | 上传当前摄像头截图 |
| `turn.end` | 用户本轮说话结束 |
| `playback.done` | AI 语音播放完成 |
| `session.stop` | 结束会话 |

后端返回：

| 事件 | 说明 |
|---|---|
| `session.ready` | 会话已准备 |
| `asr.partial` | 临时语音识别结果 |
| `asr.final` | 最终语音识别结果 |
| `assistant.thinking` | AI 正在处理 |
| `assistant.text` | AI 文本回答 |
| `assistant.audio` | AI 语音结果 |
| `assistant.done` | 本轮回复完成 |
| `usage.update` | 基础用量更新 |
| `error` | 错误信息 |

## 技术栈规划

- 前端：TypeScript、浏览器 MediaDevices API、WebSocket
- 后端：Node.js、TypeScript、WebSocket
- AI 编排：LangGraph
- 语音识别：豆包流式语音识别
- 语音合成：豆包语音合成模型
- 多模态模型：GLM-5V-Turbo

## 安全边界

- 豆包、GLM 等 API Key 仅保存在后端环境变量中
- 前端不直接调用 ASR、TTS 或 GLM 服务
- MVP 不持久化原始音频和原始图片
- 会话使用匿名 `sessionId`
- 日志仅记录必要状态、错误和基础用量

## 开发文档

详细设计、状态机、时序图、验收标准请查看：

- [spec/MVP开发文档.md](spec/MVP开发文档.md)

## 许可证

本项目使用 Apache License 2.0，详见 [LICENSE](LICENSE)。
