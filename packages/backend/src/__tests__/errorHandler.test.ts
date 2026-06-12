import { describe, it, expect, vi, afterEach } from "vitest";
import { Request, Response } from "express";
import { errorHandler } from "../middleware/errorHandler.js";
import { AppError, SessionError, ValidationError } from "../lib/errors.js";

function mockRes(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AppError 返回对应 statusCode 和 JSON", () => {
    const res = mockRes();
    const err = new AppError("Not found", 404, "NOT_FOUND");

    errorHandler(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });

  it("SessionError 返回 400 + SESSION_ERROR", () => {
    const res = mockRes();
    const err = new SessionError("Invalid state transition");

    errorHandler(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "SESSION_ERROR", message: "Invalid state transition" },
    });
  });

  it("ValidationError 返回 400 + VALIDATION_ERROR", () => {
    const res = mockRes();
    const err = new ValidationError("sessionId is required");

    errorHandler(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "VALIDATION_ERROR", message: "sessionId is required" },
    });
  });

  it("未知 Error 返回 500 + INTERNAL_ERROR", () => {
    const res = mockRes();
    const err = new Error("Something crashed");

    errorHandler(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    // 非 production 环境显示原始错误消息
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Something crashed" },
    });
  });

  it("production 环境隐藏错误细节", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = mockRes();
    const err = new Error("Sensitive details");

    errorHandler(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });
});
