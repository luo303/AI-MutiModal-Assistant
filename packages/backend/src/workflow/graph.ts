import { StateGraph, START, END } from "@langchain/langgraph";
import { WorkflowState } from "./state.js";
import {
  type WorkflowDeps,
  receiveTurnNode,
  loadLatestFrameNodeFactory,
  callGlm5vTurboNodeFactory,
  synthesizeWithDoubaoTtsNodeFactory,
  recordUsageNodeFactory,
} from "./nodes.js";
import { logger } from "../lib/logger.js";

const MODULE = "workflow";

/**
 * 构建并编译 MVP 工作流图。
 *
 * 5 节点线性链：receiveTurn → loadLatestFrame → callGlm5vTurbo → synthesizeWithDoubaoTts → recordUsage
 *
 * ```typescript
 * const graph = createMvpGraph({ glmService, ttsService });
 * const result = await graph.invoke({ sessionId, userText });
 * ```
 */
export function createMvpGraph(deps: WorkflowDeps) {
  const graph = new StateGraph(WorkflowState)
    // ── 添加节点 ──────────────────────────────────
    .addNode("receiveTurn", receiveTurnNode)
    .addNode("loadLatestFrame", loadLatestFrameNodeFactory(deps))
    .addNode("callGlm5vTurbo", callGlm5vTurboNodeFactory(deps))
    .addNode("synthesizeWithDoubaoTts", synthesizeWithDoubaoTtsNodeFactory(deps))
    .addNode("recordUsage", recordUsageNodeFactory(deps))

    // ── 线性边：START → node1 → node2 → ... → node5 → END
    .addEdge(START, "receiveTurn")
    .addEdge("receiveTurn", "loadLatestFrame")
    .addEdge("loadLatestFrame", "callGlm5vTurbo")
    .addEdge("callGlm5vTurbo", "synthesizeWithDoubaoTts")
    .addEdge("synthesizeWithDoubaoTts", "recordUsage")
    .addEdge("recordUsage", END);

  logger.info(MODULE, "MVP workflow graph compiled");

  return graph.compile();
}

export type MvpGraph = ReturnType<typeof createMvpGraph>;
