import { randomFillSync } from 'node:crypto';

/**
 * RFC 9562 UUID version 7: 48-bit big-endian millisecond timestamp, then random.
 * node:crypto.randomUUID() emits v4 and silently ignores { version: 7 } (ADR-0008).
 */
export function uuidV7(nowMs: number = Date.now()): string {
  const bytes = Buffer.allocUnsafe(16);
  randomFillSync(bytes);
  bytes.writeUIntBE(nowMs, 0, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6); // version 7
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8); // variant 10xx
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
