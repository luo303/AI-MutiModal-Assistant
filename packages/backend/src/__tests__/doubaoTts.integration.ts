/**
 * 豆包 TTS 真实 API 连通性测试
 *
 * 用法：
 *   npx tsx src/__tests__/doubaoTts.integration.ts
 *   npx tsx src/__tests__/doubaoTts.integration.ts "你好世界"
 */

import { writeFileSync } from "node:fs";
import { DoubaoTtsService } from "../services/doubaoTts.js";

const SERVICE = new DoubaoTtsService();

async function main() {
  const text = process.argv[2] ?? "你好，我是AI视觉助手，有什么可以帮你的吗？";

  console.log("═══════════════════════════════════════════");
  console.log("  豆包 TTS 连通性测试");
  console.log("═══════════════════════════════════════════\n");

  console.log(`📝 合成文本: "${text}"\n`);

  try {
    const t1 = Date.now();
    const result = await SERVICE.synthesize({ text });
    const elapsed = Date.now() - t1;

    console.log(`  ✅ 合成成功 (${elapsed}ms)`);
    console.log(`  📊 音频大小: ${result.audio.length} bytes`);
    console.log(`  🎵 编码格式: ${result.encoding}`);

    // 保存到文件，方便用户播放验证
    const outPath = `test-tts-output.${result.encoding}`;
    writeFileSync(outPath, result.audio);
    console.log(`  💾 已保存: ${outPath}\n`);

    console.log("═══════════════════════════════════════════");
    console.log("  🎉 TTS 服务测试完成（播放文件验证音质）");
    console.log("═══════════════════════════════════════════");
  } catch (err) {
    console.error(`\n  ❌ 失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
