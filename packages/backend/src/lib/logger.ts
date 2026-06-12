type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function timestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  const minLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function format(level: LogLevel, module: string, message: string, meta?: unknown): string {
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp()}] [${level.toUpperCase()}] [${module}] ${message}${metaStr}`;
}

export const logger = {
  debug(module: string, message: string, meta?: unknown): void {
    if (shouldLog("debug")) console.debug(format("debug", module, message, meta));
  },
  info(module: string, message: string, meta?: unknown): void {
    if (shouldLog("info")) console.info(format("info", module, message, meta));
  },
  warn(module: string, message: string, meta?: unknown): void {
    if (shouldLog("warn")) console.warn(format("warn", module, message, meta));
  },
  error(module: string, message: string, meta?: unknown): void {
    if (shouldLog("error")) console.error(format("error", module, message, meta));
  },
};
