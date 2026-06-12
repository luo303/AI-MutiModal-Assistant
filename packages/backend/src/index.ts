import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { wsGateway } from "./gateway/wsGateway.js";
import { errorHandler } from "./middleware/errorHandler.js";
import healthRouter from "./routes/health.js";

const MODULE = "server";

const app = express();
const server = createServer(app);

// ── HTTP 中间件 ──────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── HTTP 路由 ────────────────────────────────────────
app.use(healthRouter);

// ── WebSocket 网关 ────────────────────────────────────
wsGateway.setup(server);

// ── 错误处理（必须放在最后） ──────────────────────────
app.use(errorHandler);

// ── 启动 ─────────────────────────────────────────────
server.listen(env.PORT, () => {
  logger.info(MODULE, `Backend listening on http://localhost:${env.PORT}`);
  logger.info(MODULE, `WebSocket ready on ws://localhost:${env.PORT}/ws`);
});

export { app, server };
