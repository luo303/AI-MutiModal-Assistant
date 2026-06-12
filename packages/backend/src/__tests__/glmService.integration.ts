/**
 * GLM-4V 真实 API 连通性测试
 *
 * 测试流程：
 * 1. 纯文本对话（验证基础连通性 + API Key）
 * 2. 多模态理解（文字 + 图片，可选）
 *
 * 用法：
 *   npx tsx src/__tests__/glmService.integration.ts
 *   npx tsx src/__tests__/glmService.integration.ts ./test-image.jpg "这是什么？"
 */

import { existsSync, readFileSync } from "node:fs";
import { GlmService } from "../services/glmService.js";

const SERVICE = new GlmService();

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  GLM-4V 连通性测试");
  console.log("═══════════════════════════════════════════\n");

  // ── Test 1: 纯文本 ─────────────────────────
  console.log("[1/2] 纯文本对话测试...");
  try {
    const t1 = Date.now();
    const result = await SERVICE.call({
      userText: "你好，请简单介绍一下你自己，一句话。",
    });
    console.log(`  ✅ 响应 (${Date.now() - t1}ms): "${result.text.slice(0, 100)}"`);
    console.log(`  📊 用量: prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens} total=${result.usage.totalTokens}`);
    console.log(`  🤖 模型: ${result.model}\n`);
  } catch (err) {
    console.error(`  ❌ 失败: ${(err as Error).message}\n`);
  }

  // ── Test 2: 文字 + 图片（如果提供了图片）───
  const imagePath = process.argv[2];
  const question = process.argv[3] ?? "这张图片里有什么？";

  if (imagePath && existsSync(imagePath)) {
    console.log(`[2/2] 多模态理解测试 (${imagePath})...`);
    try {
      const imageBuffer = readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString("base64");

      const t1 = Date.now();
      const result = await SERVICE.call({
        userText: question,
        imageBase64,
      });
      console.log(`  ✅ 响应 (${Date.now() - t1}ms): "${result.text}"`);
      console.log(`  📊 用量: prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens} total=${result.usage.totalTokens}\n`);
    } catch (err) {
      console.error(`  ❌ 失败: ${(err as Error).message}\n`);
    }
  } else if (imagePath) {
    console.log(`[2/2] ⚠ 图片不存在: ${imagePath}，跳过多模态测试\n`);
  } else {
    console.log("[2/2] 未提供图片，跳过多模态测试\n");
    console.log("  💡 提示：用图片测试视觉理解：");
    console.log("     npx tsx src/services/glmService.integration.ts ./test-image.jpg \"这是什么？\"\n");
  }

  console.log("═══════════════════════════════════════════");
  console.log("  🎉 GLM 服务测试完成");
  console.log("═══════════════════════════════════════════");
}

main().catch((err) => {
  console.error("\n❌ 测试失败:", err.message);
  console.error(err.stack);
  process.exit(1);
});
