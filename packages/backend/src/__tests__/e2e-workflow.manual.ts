import { createMvpGraph } from "../workflow/graph.js";
import { glmService } from "../services/glmService.js";
import { doubaoTts } from "../services/doubaoTts.js";

async function main() {
  console.log("🟢 编译工作流图...");
  const graph = createMvpGraph({ glmService, ttsService: doubaoTts });

  console.log("📡 调用真实 GLM-4V + TTS API...\n");

  const result = await graph.invoke({
    sessionId: "e2e-test",
    userText: "用一句话告诉我，你作为一个AI助手能做什么？",
  });

  console.log("── 结果 ──");
  console.log("📝 AI 回复:", result.assistantText || "(无)");
  console.log("🎵 音频大小:", result.assistantAudio ? `${result.assistantAudio.length} bytes` : "(无)");
  console.log("❌ 错误:", result.error || "(无)");
  console.log("📊 glmCalls:", result.glmCalls, "ttsCalls:", result.ttsCalls);
}

main().catch((err) => {
  console.error("💥 测试失败:", err);
  process.exit(1);
});
