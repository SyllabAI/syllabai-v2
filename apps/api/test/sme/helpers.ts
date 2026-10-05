/**
 * Shared helpers for the T-MIG-033 tranche-3 SME tests: a minimal ZIP
 * builder (local headers + central directory + EOCD, stored or deflated
 * entries, CRC32 computed — or overridden to simulate corruption) and a
 * deterministic uuid synth for KG nodes.
 */
import { deflateRawSync } from "node:zlib";

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export interface ZipEntrySpec {
  name: string;
  data?: Uint8Array;
  /** 0 = stored, 8 = deflate (default: 8 when data length > 0, else 0) */
  method?: 0 | 8;
  /** force a WRONG crc to simulate corruption */
  crcOverride?: number;
  /** force general-purpose flags (bit 3 data descriptor, bit 0 encryption) */
  flagsOverride?: number;
  /** lie about the uncompressed size in the header */
  uncompSizeOverride?: number;
}

function u16le(v: number): [number, number] {
  return [v & 0xff, (v >>> 8) & 0xff];
}
function u32le(v: number): [number, number, number, number] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/** Build zip bytes the way python's zipfile does (seekable output: header sizes). */
export function buildZip(entries: ZipEntrySpec[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const e of entries) {
    const raw = e.data ?? new Uint8Array(0);
    const method = e.method ?? (raw.length > 0 ? 8 : 0);
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const crc = e.crcOverride ?? crc32(raw);
    const flags = e.flagsOverride ?? 0;
    const nameBytes = new TextEncoder().encode(e.name);
    const uncompSize = e.uncompSizeOverride ?? raw.length;

    const localStart = out.length;
    out.push(...u32le(0x04034b50), 20, 0, ...u16le(flags), ...u16le(method));
    out.push(0, 0, 0, 0); // time + date
    out.push(...u32le(crc), ...u32le(compressed.length), ...u32le(uncompSize));
    out.push(...u16le(nameBytes.length), 0, 0); // name len + extra len
    out.push(...nameBytes, ...compressed);

    central.push(
      ...u32le(0x02014b50),
      20,
      20,
      ...u16le(flags),
      ...u16le(method),
      0,
      0,
      0,
      0,
      ...u32le(crc),
      ...u32le(compressed.length),
      ...u32le(uncompSize),
      ...u16le(nameBytes.length),
      0,
      0,
      0,
      0,
      0,
      ...u32le(0),
      ...u32le(localStart),
      ...nameBytes,
    );
    offset = out.length;
  }

  const centralStart = offset;
  out.push(...central);
  const eocdAt = out.length;
  out.push(
    ...u32le(0x06054b50),
    0,
    0,
    ...u16le(entries.length),
    ...u16le(entries.length),
    ...u32le(out.length - centralStart),
    ...u32le(centralStart),
    0,
    0,
  );
  void eocdAt;
  return new Uint8Array(out);
}

const enc = new TextEncoder();
export const bytes = (s: string): Uint8Array => enc.encode(s);

const NODE_NAMESPACE = "7e6e8a50-0000-4000-8000-";
/** deterministic uuid per KG code so fake-sql assertions can pin node ids */
export function synthUuid(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h * 31) + key.charCodeAt(i)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return NODE_NAMESPACE + hex;
}
