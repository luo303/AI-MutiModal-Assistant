export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export class AsrError extends AppError {
  constructor(message: string, code: string = "ASR_ERROR") {
    super(message, 502, code);
    this.name = "AsrError";
  }
}

export class TtsError extends AppError {
  constructor(message: string, code: string = "TTS_ERROR") {
    super(message, 502, code);
    this.name = "TtsError";
  }
}

export class GlmError extends AppError {
  constructor(message: string, code: string = "GLM_ERROR") {
    super(message, 502, code);
    this.name = "GlmError";
  }
}

export class SessionError extends AppError {
  constructor(message: string, code: string = "SESSION_ERROR") {
    super(message, 400, code);
    this.name = "SessionError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: string = "VALIDATION_ERROR") {
    super(message, 400, code);
    this.name = "ValidationError";
  }
}
