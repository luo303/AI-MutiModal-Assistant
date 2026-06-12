/**
 * Workflow 基础类型定义
 *
 * MVP 工作流：receiveTurn → loadLatestFrame → callGlm5vTurbo → synthesizeWithDoubaoTts → recordUsage
 */

export interface WorkflowInput {
  sessionId: string;
  userText: string;
  latestFrameBase64?: string;
}

export interface WorkflowOutput {
  sessionId: string;
  userText: string;
  assistantText: string;
  assistantAudio: Buffer;
  usage: UsageMetrics;
}

export interface UsageMetrics {
  asrCalls: number;
  glmCalls: number;
  ttsCalls: number;
  totalTurns: number;
  imageCount: number;
}

/** 工作流执行依赖（注入真实服务） */
export interface WorkflowDeps {
  glmService: {
    call(text: string, imageBase64?: string): Promise<string>;
  };
  ttsService: {
    synthesize(text: string): Promise<Buffer>;
  };
  usageRecorder: {
    recordAsrCall(sessionId: string): void;
    recordGlmCall(sessionId: string): void;
    recordTtsCall(sessionId: string): void;
    recordImage(sessionId: string): void;
    getMetrics(sessionId: string): UsageMetrics;
  };
}
