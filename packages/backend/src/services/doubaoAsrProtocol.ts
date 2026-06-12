/**
 * 火山引擎 ASR 二进制协议帧构建/解析工具
 *
 * 帧格式：
 * ┌──────────────────────┬──────────────────┬──────────────────────┐
 * │ Header (4+ bytes)    │ [Sequence (4B)]  │ PayloadSize (4B)     │ Payload │
 * └──────────────────────┴──────────────────┴──────────────────────┘
 *
 * Header 格式（每个字段 4 bits）：
 *   Byte 0: Protocol-Version | Header-Size
 *   Byte 1: Message-Type      | Flags
 *   Byte 2: Serialization     | Compression
 *   Byte 3: Reserved (0x00)
 *
 * 所有多字节整数均为 Big-Endian。
 */

import { Buffer } from "node:buffer";

// ── 协议常量 ──────────────────────────────────────────

export const PROTOCOL_VERSION = 0b0001;
export const HEADER_SIZE_DEFAULT = 0b0001; // 1 × 4 = 4 bytes

// Message Type (Byte 1, bits 7-4)
export const MSG_FULL_REQUEST = 0b0001;
export const MSG_AUDIO_ONLY = 0b0010;
export const MSG_SERVER_RESPONSE = 0b1001;
export const MSG_ERROR = 0b1111;

// Flags (Byte 1, bits 3-0)
export const FLAG_NO_SEQ = 0b0000;
export const FLAG_POS_SEQ = 0b0001;
export const FLAG_NEG_SEQ = 0b0011; // 最后一包（负包）

// Serialization (Byte 2, bits 7-4)
export const SERIAL_RAW = 0b0000;
export const SERIAL_JSON = 0b0001;

// Compression (Byte 2, bits 3-0)
export const COMPRESS_NONE = 0b0000;
export const COMPRESS_GZIP = 0b0001;

// ── 解析结果类型 ──────────────────────────────────────

export interface ParsedFrame {
  msgType: number;
  flags: number;
  serialization: number;
  compression: number;
  headerSize: number;
  sequence?: number;
  payload: Buffer;
}

// ── 帧构建 ────────────────────────────────────────────

/**
 * 构建 4-byte 协议 Header
 *
 * @param msgType      - Message Type (4 bits)
 * @param flags        - Message Type Specific Flags (4 bits)
 * @param serialization - Serialization method (4 bits)
 * @param compression  - Compression algorithm (4 bits)
 */
export function buildHeader(
  msgType: number,
  flags: number,
  serialization: number,
  compression: number,
): Buffer {
  const buf = Buffer.alloc(4);
  buf[0] = ((PROTOCOL_VERSION & 0x0f) << 4) | (HEADER_SIZE_DEFAULT & 0x0f);
  buf[1] = ((msgType & 0x0f) << 4) | (flags & 0x0f);
  buf[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f);
  buf[3] = 0x00;
  return buf;
}

/**
 * 构建完整协议帧
 *
 * 结构：Header + [Sequence Number] + PayloadSize + Payload
 *
 * @param header   - 4-byte header
 * @param payload  - 载荷数据
 * @param sequence - 可选序号（有 FLAG_POS_SEQ 或 FLAG_NEG_SEQ 时提供）
 */
export function buildFrame(
  header: Buffer,
  payload: Buffer,
  sequence?: number,
): Buffer {
  const parts: Buffer[] = [header];

  if (sequence !== undefined) {
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeInt32BE(sequence, 0);
    parts.push(seqBuf);
  }

  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(payload.length, 0);
  parts.push(sizeBuf);
  parts.push(payload);

  return Buffer.concat(parts);
}

// ── 帧解析 ────────────────────────────────────────────

/**
 * 解析接收到的二进制帧
 *
 * @param data - 完整帧 Buffer
 * @returns 解析后的帧结构
 */
export function parseFrame(data: Buffer): ParsedFrame {
  let offset = 0;
  const headerSize = (data[0] & 0x0f) * 4;
  const msgType = (data[1] >> 4) & 0x0f;
  const flags = data[1] & 0x0f;
  const serialization = (data[2] >> 4) & 0x0f;
  const compression = data[2] & 0x0f;
  offset += headerSize;

  let sequence: number | undefined;
  // FLAG_POS_SEQ (0b0001) 或 FLAG_NEG_SEQ (0b0011) 表示有序列号
  if (flags === FLAG_POS_SEQ || flags === FLAG_NEG_SEQ) {
    sequence = data.readInt32BE(offset);
    offset += 4;
  }

  const payloadSize = data.readUInt32BE(offset);
  offset += 4;

  const payload = data.subarray(offset, offset + payloadSize);

  return { msgType, flags, serialization, compression, headerSize, sequence, payload };
}

/**
 * 从解析帧中解压 JSON payload
 * 根据 compression 字段自动处理 gzip/无压缩
 */
export function extractJsonPayload(frame: ParsedFrame): string {
  if (frame.compression === COMPRESS_GZIP) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { gunzipSync } = require("node:zlib") as typeof import("node:zlib");
    return gunzipSync(frame.payload).toString("utf-8");
  }
  return frame.payload.toString("utf-8");
}
