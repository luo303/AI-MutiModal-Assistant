# AI 视觉对话助手

AI 视觉对话助手是一个 MVP 阶段的多模态语音交互项目，在浏览器中打通"摄像头画面 + 用户语音 → AI 多模态理解 → 文本与语音回复"的最小闭环。

## 项目架构

本仓库采用 **monorepo** 架构，使用 pnpm workspace 管理。

```
AI-MutiModal-Assistant/
├── pnpm-workspace.yaml        # pnpm workspace 定义
├── tsconfig.base.json         # 公共 TypeScript 配置
├── docker-compose.yml         # 容器编排
├── Dockerfile.frontend        # 前端构建镜像
├── Dockerfile.backend         # 后端构建镜像
├── .env.example               # 环境变量模板
│
├── packages/
│   ├── frontend/              # React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── vite.config.ts
│   │   └── index.html
│   │
│   └── backend/               # Express + TypeScript
│       └── src/
│           └── index.ts
│
└── spec/
    └── MVP开发文档.md          # MVP 详细设计文档
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| 后端框架 | Express 5 + TypeScript |
| 数据库 | PostgreSQL 16（Docker，暂不使用） |
| 容器化 | Docker Compose |
| 包管理 | pnpm workspace |

## 快速开始

### 本地开发

```bash
# 安装依赖
pnpm install

# 同时启动前后端
pnpm dev

# 或分别启动
pnpm dev:frontend   # 前端 → http://localhost:5173
pnpm dev:backend    # 后端 → http://localhost:3001
```

### Docker 部署

```bash
# 复制环境变量
cp .env.example .env

# 启动所有服务
docker compose up -d

# 前端 → http://localhost:5173
# 后端 → http://localhost:3001
# 数据库 → localhost:5432
```

## MVP 功能概述

- 摄像头预览与当前画面截图
- 麦克风采集与音频片段上传
- 基于 WebSocket 的前后端实时通信
- 豆包流式 ASR 语音识别
- LangGraph 最小 AI 工作流编排
- GLM-5V-Turbo 图文多模态理解
- 豆包 TTS 语音合成
- 前端展示用户文本、AI 文本并播放 AI 语音
- 每轮基础用量记录

## 开发文档

详细设计、状态机、时序图、验收标准请参见 [spec/MVP开发文档.md](spec/MVP开发文档.md)。

## 许可证

Apache License 2.0