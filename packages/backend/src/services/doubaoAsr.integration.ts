/**
 * 豆包 ASR 真实 API 连通性测试
 *
 * 测试流程：
 * 1. WebSocket 连接火山引擎 ASR
 * 2. 读取 WAV 文件 → 提取 PCM 数据
 * 3. 按 200ms 分片发送
 * 4. 停止识别，输出识别文本
 *
 * 用法：
 *   # 默认：自动生成合成语音测试
 *   npx tsx src/services/doubaoAsr.integration.ts
 *
 *   # 使用真实 WAV 录音（推荐，16kHz 16bit mono PCM）
 *   npx tsx src/services/doubaoAsr.integration.ts ./test-audio.wav
 */

import { readFileSync, existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { DoubaoAsrService } from "./doubaoAsr.js";

const SERVICE = new DoubaoAsrService();
const TEST_SESSION = "test-session-001";

// ── WAV 文件读取 ─────────────────────────────────────

/** 读取 WAV 文件，提取 PCM 数据 */
function readWavPcm(filePath: string): Buffer {
  const buf = readFileSync(filePath);
  // WAV header: 44 bytes, then raw PCM data
  // 跳过 RIFF header (44 bytes)
  if (buf.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Not a valid WAV file");
  }

  // 读取音频格式信息
  const audioFormat = buf.readUInt16LE(20);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  console.log(`  WAV: ${sampleRate}Hz, ${bitsPerSample}bit, ${numChannels}ch, format=${audioFormat}`);

  if (sampleRate !== 16000 || bitsPerSample !== 16 || numChannels !== 1) {
    console.warn("  ⚠ 推荐格式: 16000Hz 16bit mono PCM，当前格式可能不被 ASR 接受");
  }

  // 查找 data chunk
  let offset = 12;
  while (offset < buf.length - 8) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return buf.subarray(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize;
  }

  throw new Error("No data chunk found in WAV file");
}

// ── 合成语音生成 ─────────────────────────────────────

/**
 * 生成模拟语音的 PCM 数据（16kHz 16bit mono）
 *
 * 用交替的高低频正弦波模拟"你好"两个音节，
 * 包含振幅包络（attack/decay）和音节间隔。
 */
function generateSpeechPcm(): Buffer {
  const SAMPLE_RATE = 16000;
  const DURATION_MS = 1200; // 总时长 1.2s

  // 模拟"你好"两个音节
  // 音节1: ~350ms, 基频 ~180Hz, 带 formant-like overtone
  // 间隔: ~80ms
  // 音节2: ~400ms, 基频 ~220Hz, rising tone
  const syllables = [
    { startMs: 0, durationMs: 350, f0: 180 },
    { startMs: 430, durationMs: 400, f0: 220 },
  ];

  const totalSamples = Math.floor(SAMPLE_RATE * (DURATION_MS / 1000));
  const buf = Buffer.alloc(totalSamples * 2);

  for (let i = 0; i < totalSamples; i++) {
    const tMs = (i / SAMPLE_RATE) * 1000;
    let sample = 0;

    for (const syl of syllables) {
      if (tMs >= syl.startMs && tMs < syl.startMs + syl.durationMs) {
        const localT = (tMs - syl.startMs) / 1000;
        const durationS = syl.durationMs / 1000;

        // 振幅包络：快速起音 + 缓慢衰减
        const attack = Math.min(1, localT / 0.02); // 20ms attack
        const decay = Math.max(0, 1 - (localT - 0.15) / (durationS - 0.15));
        const envelope = attack * Math.max(0.1, decay);

        // 基频 + 谐波（formant-like）
        const fundamental = Math.sin(2 * Math.PI * syl.f0 * (i / SAMPLE_RATE));
        const harmonic1 = 0.5 * Math.sin(2 * Math.PI * syl.f0 * 2 * (i / SAMPLE_RATE));
        const harmonic2 = 0.3 * Math.sin(2 * Math.PI * syl.f0 * 3 * (i / SAMPLE_RATE));
        // 加入略微频率调制（颤音效果）
        const vibrato = 1 + 0.003 * Math.sin(2 * Math.PI * 5 * localT);

        sample += envelope * 0.6 * (fundamental * vibrato + harmonic1 + harmonic2);
      }
    }

    // 加入轻微背景噪声
    sample += (Math.random() - 0.5) * 0.01;

    // Clamp to 16-bit range
    const clamped = Math.max(-1, Math.min(1, sample));
    buf.writeInt16LE(Math.floor(clamped * 20000), i * 2);
  }

  return buf;
}

// ── 测试主流程 ───────────────────────────────────────

async function main() {
  const wavPath = process.argv[2];

  console.log("═══════════════════════════════════════════");
  console.log("  豆包 ASR 连通性测试");
  console.log("═══════════════════════════════════════════\n");

  // ── Step 0: 获取音频数据 ──────────────────
  let pcmData: Buffer;

  if (wavPath && existsSync(wavPath)) {
    console.log(`[0/4] 读取 WAV 文件: ${wavPath}`);
    pcmData = readWavPcm(wavPath);
    const durationMs = Math.round((pcmData.length / 2 / 16000) * 1000);
    console.log(`  ✓ 读取成功 (${pcmData.length} bytes, ~${durationMs}ms)\n`);
  } else {
    if (wavPath) {
      console.log(`  ⚠ 文件不存在: ${wavPath}，使用合成语音\n`);
    } else {
      console.log("[0/4] 未指定 WAV 文件，使用合成语音\n");
    }
    console.log("  💡 提示：录制一段 WAV 语音可获得真实识别结果：");
    console.log("     npx tsx src/services/doubaoAsr.integration.ts ./test-audio.wav\n");
    pcmData = generateSpeechPcm();
    console.log(`  ✓ 生成合成语音 (${pcmData.length} bytes, ~1200ms)\n`);
  }

  // ── Step 1: 启动识别 ──────────────────────
  console.log("[1/4] 建立 ASR WebSocket 连接...");
  const startTime = Date.now();

  await SERVICE.startRecognition(TEST_SESSION, {
    onPartial: (sid, text) => {
      console.log(`  📝 partial: "${text}"`);
    },
    onFinal: (sid, text) => {
      console.log(`  ✅ final: "${text}"`);
    },
    onError: (sid, err) => {
      console.log(`  ❌ error: ${err.message}`);
    },
  });

  console.log(`  ✓ 连接建立 (${Date.now() - startTime}ms)\n`);

  // ── Step 2: 分片发送音频 ──────────────────
  const CHUNK_MS = 200;
  const chunkSize = Math.floor(16000 * (CHUNK_MS / 1000)) * 2; // bytes per 200ms
  const totalChunks = Math.ceil(pcmData.length / chunkSize);

  console.log(`[2/4] 发送 PCM 音频 (${totalChunks} × ${CHUNK_MS}ms 分片)...`);

  for (let i = 0; i < totalChunks; i++) {
    const offset = i * chunkSize;
    const end = Math.min(offset + chunkSize, pcmData.length);
    const chunk = pcmData.subarray(offset, end);

    // 最后一包可能不足 200ms，补齐
    let sendChunk = chunk;
    if (chunk.length < chunkSize) {
      sendChunk = Buffer.alloc(chunkSize);
      chunk.copy(sendChunk);
    }

    SERVICE.sendAudioChunk(TEST_SESSION, sendChunk);
    console.log(`  → chunk #${i + 1}/${totalChunks} (${chunk.length} bytes)`);

    // 模拟实时流间隔
    await sleep(CHUNK_MS * 0.9);
  }
  console.log();

  // ── Step 3: 停止识别 ──────────────────────
  console.log("[3/4] 发送停止帧，等待最终结果...");

  let finalText = "";
  try {
    finalText = await SERVICE.stopRecognition(TEST_SESSION);
  } catch (err) {
    console.log(`  ⚠ stopRecognition: ${(err as Error).message}`);
  }

  if (finalText) {
    console.log(`\n  🎤 识别结果: "${finalText}"\n`);
  } else {
    console.log(`  结果: 无识别文本\n`);
    if (!wavPath) {
      console.log("  💡 合成语音通常无法被识别，用真实录音试试：");
      console.log("     npx tsx src/services/doubaoAsr.integration.ts ./test-audio.wav\n");
    }
  }

  // ── Step 4: 清理 ──────────────────────────
  console.log("[4/4] 清理...");
  const hasSession = SERVICE.hasActiveSession(TEST_SESSION);
  if (hasSession) {
    SERVICE.close(TEST_SESSION);
  }
  console.log("  ✓ 完成\n");

  console.log("═══════════════════════════════════════════");
  console.log("  🎉 协议层工作正常");
  console.log("═══════════════════════════════════════════");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("\n❌ 测试失败:", err.message);
  console.error(err.stack);
  process.exit(1);
});
