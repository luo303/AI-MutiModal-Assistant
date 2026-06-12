import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";
import {
  buildHeader,
  buildFrame,
  parseFrame,
  extractJsonPayload,
  MSG_FULL_REQUEST,
  MSG_AUDIO_ONLY,
  MSG_SERVER_RESPONSE,
  MSG_ERROR,
  FLAG_NO_SEQ,
  FLAG_POS_SEQ,
  FLAG_NEG_SEQ,
  SERIAL_JSON,
  SERIAL_RAW,
  COMPRESS_NONE,
  COMPRESS_GZIP,
  PROTOCOL_VERSION,
  HEADER_SIZE_DEFAULT,
} from "../services/doubaoAsrProtocol.js";

// ─── buildHeader ───────────────────────────────────────

describe("buildHeader", () => {
  it("构建 Full Client Request header（JSON + 无压缩 + 无序列号）", () => {
    const header = buildHeader(MSG_FULL_REQUEST, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE);

    expect(header).toHaveLength(4);
    // Byte 0: version=1 (0b0001), header_size=1 (0b0001) → 0x11
    expect(header[0]).toBe(0x11);
    // Byte 1: msg_type=1 (0b0001), flags=0 (0b0000) → 0x10
    expect(header[1]).toBe(0x10);
    // Byte 2: serialization=JSON(0b0001), compression=NONE(0b0000) → 0x10
    expect(header[2]).toBe(0x10);
    // Byte 3: reserved
    expect(header[3]).toBe(0x00);
  });

  it("构建 Audio Only header（RAW + 正序列号）", () => {
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_POS_SEQ, SERIAL_RAW, COMPRESS_NONE);

    expect(header[0]).toBe(0x11);
    // Byte 1: msg_type=2 (0b0010), flags=1 (0b0001) → 0x21
    expect(header[1]).toBe(0x21);
    // Byte 2: serialization=RAW(0b0000), compression=NONE(0b0000) → 0x00
    expect(header[2]).toBe(0x00);
    expect(header[3]).toBe(0x00);
  });

  it("构建 Audio Only header（最后一包，负序列号）", () => {
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_NEG_SEQ, SERIAL_RAW, COMPRESS_NONE);

    expect(header[0]).toBe(0x11);
    // Byte 1: msg_type=2 (0b0010), flags=3 (0b0011) → 0x23
    expect(header[1]).toBe(0x23);
    expect(header[2]).toBe(0x00);
  });

  it("构建 Server Response header（JSON + Gzip）", () => {
    const header = buildHeader(MSG_SERVER_RESPONSE, FLAG_POS_SEQ, SERIAL_JSON, COMPRESS_GZIP);

    expect(header[0]).toBe(0x11);
    // Byte 1: msg_type=9 (0b1001), flags=1 (0b0001) → 0x91
    expect(header[1]).toBe(0x91);
    // Byte 2: serialization=JSON(0b0001), compression=GZIP(0b0001) → 0x11
    expect(header[2]).toBe(0x11);
  });

  it("构建 Error header", () => {
    const header = buildHeader(MSG_ERROR, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE);

    // Byte 1: msg_type=15 (0b1111), flags=0 (0b0000) → 0xf0
    expect(header[1]).toBe(0xf0);
  });
});

// ─── buildFrame ────────────────────────────────────────

describe("buildFrame", () => {
  it("构建无序列号的帧（Full Client Request）", () => {
    const payload = Buffer.from(JSON.stringify({ audio: { format: "pcm" } }), "utf-8");
    const header = buildHeader(MSG_FULL_REQUEST, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE);
    const frame = buildFrame(header, payload);

    // Header(4) + PayloadSize(4) + Payload
    expect(frame.length).toBe(4 + 4 + payload.length);

    // 验证 PayloadSize 字段（位于 header 后 4 字节，big-endian）
    const sizeOffset = 4;
    const size = frame.readUInt32BE(sizeOffset);
    expect(size).toBe(payload.length);
  });

  it("构建有序列号的帧（Audio Only）", () => {
    const payload = Buffer.alloc(3200); // 200ms of 16kHz 16bit mono PCM
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_POS_SEQ, SERIAL_RAW, COMPRESS_NONE);
    const seqNo = 42;
    const frame = buildFrame(header, payload, seqNo);

    // Header(4) + Sequence(4) + PayloadSize(4) + Payload
    expect(frame.length).toBe(4 + 4 + 4 + payload.length);

    // 验证序列号
    const seq = frame.readInt32BE(4);
    expect(seq).toBe(42);

    // 验证 PayloadSize（位于 header+sequence 后）
    const size = frame.readUInt32BE(8);
    expect(size).toBe(payload.length);
  });

  it("构建负序列号帧（最后一包）", () => {
    const payload = Buffer.alloc(0);
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_NEG_SEQ, SERIAL_RAW, COMPRESS_NONE);
    const lastSeqNo = -10;
    const frame = buildFrame(header, payload, lastSeqNo);

    const seq = frame.readInt32BE(4);
    expect(seq).toBe(-10);

    // 空 payload
    const size = frame.readUInt32BE(8);
    expect(size).toBe(0);
  });

  it("空 payload 帧正确构建", () => {
    const header = buildHeader(MSG_FULL_REQUEST, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE);
    const frame = buildFrame(header, Buffer.alloc(0));

    const size = frame.readUInt32BE(4);
    expect(size).toBe(0);
    expect(frame.length).toBe(8); // 仅 header + size
  });
});

// ─── parseFrame ────────────────────────────────────────

describe("parseFrame", () => {
  it("解析无序列号的帧（Full Request）", () => {
    const payload = Buffer.from(JSON.stringify({ request: { model_name: "bigmodel" } }), "utf-8");
    const header = buildHeader(MSG_FULL_REQUEST, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE);
    const frame = buildFrame(header, payload);

    const parsed = parseFrame(frame);

    expect(parsed.msgType).toBe(MSG_FULL_REQUEST);
    expect(parsed.flags).toBe(FLAG_NO_SEQ);
    expect(parsed.serialization).toBe(SERIAL_JSON);
    expect(parsed.compression).toBe(COMPRESS_NONE);
    expect(parsed.headerSize).toBe(4);
    expect(parsed.sequence).toBeUndefined();
    expect(parsed.payload.toString("utf-8")).toBe(
      JSON.stringify({ request: { model_name: "bigmodel" } }),
    );
  });

  it("解析有正序列号的帧（Audio Only）", () => {
    const payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_POS_SEQ, SERIAL_RAW, COMPRESS_NONE);
    const frame = buildFrame(header, payload, 7);

    const parsed = parseFrame(frame);

    expect(parsed.msgType).toBe(MSG_AUDIO_ONLY);
    expect(parsed.flags).toBe(FLAG_POS_SEQ);
    expect(parsed.sequence).toBe(7);
    expect(parsed.payload).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]));
  });

  it("解析有负序列号的帧（最后一包）", () => {
    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_NEG_SEQ, SERIAL_RAW, COMPRESS_NONE);
    const frame = buildFrame(header, Buffer.alloc(0), -15);

    const parsed = parseFrame(frame);

    expect(parsed.flags).toBe(FLAG_NEG_SEQ);
    expect(parsed.sequence).toBe(-15);
  });

  it("解析 Server Response 帧", () => {
    const response = { payload_msg: { result: [{ text: "你好", is_final: true }] } };
    const payload = Buffer.from(JSON.stringify(response), "utf-8");
    const header = buildHeader(MSG_SERVER_RESPONSE, FLAG_NEG_SEQ, SERIAL_JSON, COMPRESS_NONE);
    const frame = buildFrame(header, payload, -1);

    const parsed = parseFrame(frame);

    expect(parsed.msgType).toBe(MSG_SERVER_RESPONSE);
    expect(parsed.flags).toBe(FLAG_NEG_SEQ);
    expect(parsed.serialization).toBe(SERIAL_JSON);
    expect(parsed.sequence).toBe(-1);

    const result = JSON.parse(parsed.payload.toString("utf-8"));
    expect(result.payload_msg.result[0].text).toBe("你好");
  });

  it("二进制数据 round-trip（build → parse 一致）", () => {
    // 模拟一段 PCM 音频数据
    const pcmData = Buffer.alloc(3200);
    for (let i = 0; i < pcmData.length; i++) {
      pcmData[i] = Math.floor(Math.random() * 256);
    }

    const header = buildHeader(MSG_AUDIO_ONLY, FLAG_POS_SEQ, SERIAL_RAW, COMPRESS_NONE);
    const frame = buildFrame(header, pcmData, 100);
    const parsed = parseFrame(frame);

    expect(parsed.msgType).toBe(MSG_AUDIO_ONLY);
    expect(parsed.sequence).toBe(100);
    expect(parsed.payload).toEqual(pcmData);
  });
});

// ─── extractJsonPayload ────────────────────────────────

describe("extractJsonPayload", () => {
  it("解压 gzip 压缩的 JSON payload", () => {
    const json = JSON.stringify({ result: "ok" });
    const compressed = gzipSync(Buffer.from(json, "utf-8"));

    const parsed = parseFrame(
      buildFrame(
        buildHeader(MSG_SERVER_RESPONSE, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_GZIP),
        compressed,
      ),
    );

    const extracted = extractJsonPayload(parsed);
    expect(extracted).toBe(json);
  });

  it("直接读取无压缩的 JSON payload", () => {
    const json = JSON.stringify({ result: "hello" });
    const payload = Buffer.from(json, "utf-8");

    const parsed = parseFrame(
      buildFrame(
        buildHeader(MSG_SERVER_RESPONSE, FLAG_NO_SEQ, SERIAL_JSON, COMPRESS_NONE),
        payload,
      ),
    );

    const extracted = extractJsonPayload(parsed);
    expect(extracted).toBe(json);
  });
});

// ─── 常量验证 ──────────────────────────────────────────

describe("协议常量", () => {
  it("PROTOCOL_VERSION 和 HEADER_SIZE_DEFAULT 组成正确的 Byte 0", () => {
    const byte0 = ((PROTOCOL_VERSION & 0x0f) << 4) | (HEADER_SIZE_DEFAULT & 0x0f);
    expect(byte0).toBe(0x11);
  });

  it("所有 Message Type 值不冲突", () => {
    const types = [MSG_FULL_REQUEST, MSG_AUDIO_ONLY, MSG_SERVER_RESPONSE, MSG_ERROR];
    expect(new Set(types).size).toBe(types.length);
  });

  it("所有 Flags 值不冲突", () => {
    const flags = [FLAG_NO_SEQ, FLAG_POS_SEQ, FLAG_NEG_SEQ];
    expect(new Set(flags).size).toBe(flags.length);
  });
});
