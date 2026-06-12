import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const MODULE = "errorHandler";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn(MODULE, err.message, { code: err.code, statusCode: err.statusCode });
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  logger.error(MODULE, err.message, { stack: err.stack });
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    },
  });
}
