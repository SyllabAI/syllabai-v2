/**
 * Bounded ZIP entry walker — port of com.syllabai.shared.ZipSafety
 * (frozen @ 6cad6ef, deep-audit 09-28 M3), consumed by the SME question-bank
 * ingest (T-MIG-033 tranche-3).
 *
 * Frozen law (ZipSafety.java:1-153):
 *   - Three ABSOLUTE budgets enforced during extraction, never after
 *     allocation: per-entry uncompressed cap (64 MB), total-uncompressed cap
 *     (256 MB), entry-count cap (10 000). Java streams the inflate and
 *     aborts mid-entry the moment a budget is crossed; the port passes
 *     maxOutputLength to zlib.inflateRawSync so the decompressor itself
 *     refuses to grow past the per-entry cap (and re-checks after — the
 *     post-check is the same boundary, held even if the runtime ignored the
 *     cap option).
 *   - Structural traversal guard BEFORE any entry read: absolute paths,
 *     `..` segments (either separator), backslash separators, drive-letter
 *     prefixes. Plain names containing dots (a..b.png) stay legal.
 *   - Directory entries are skipped BEFORE the entry counter increments
 *     (ZipSafety.java:79-81) — they cost a count slot only if misread.
 *   - All three budget/guard failures throw the shared BadRequestException
 *     (→ 400 bad_request with the verbatim message); genuinely malformed
 *     archives throw an IOException-shaped error the caller translates to
 *     "could not read the corpus package (not a ZIP?)".
 *
 * Port mechanics: the walker parses the ZIP central directory (sizes there
 * are authoritative even under streaming data descriptors, which Java's
 * ZipInputStream handles transparently), then reads each entry through its
 * local header. CRC32 is verified per entry (java.util.zip verifies on
 * entry close — a mismatch is a ZipException, i.e. the not-a-ZIP class).
 * ZIP64 is not parsed: the budgets (≤64 MB/entry, 10 000 entries) keep
 * every legal archive inside the classic EOCD envelope.
 */
import { inflateRawSync } from "node:zlib";
import { BadRequestError } from "../selfmark";

/** default per-entry uncompressed ceiling (matches the multipart cap) */
export const DEFAULT_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
/** default total uncompressed ceiling across all entries in one archive */
export const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** default entry-count ceiling */
export const DEFAULT_MAX_ENTRIES = 10_000;

export interface ZipLimits {
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxEntries: number;
}

export function zipLimitsDefaults(): ZipLimits {
  return {
    maxEntryBytes: DEFAULT_MAX_ENTRY_BYTES,
    maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES,
    maxEntries: DEFAULT_MAX_ENTRIES,
  };
}

export type ZipEntryConsumer = (name: string, data: Uint8Array) => void;

/**
 * Malformed-archive signal — the IOException class of the frozen walker.
 * The ingest service translates this into the not-a-ZIP BadRequest;
 * budget/guard failures below throw BadRequestError directly (Java's
 * ZipSafety throws the shared BadRequestException for those).
 */
export class ArchiveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveFormatError";
  }
}

export class ZipBudgetError extends BadRequestError {}

// ── primitive readers (little-endian, classic ZIP) ──────────────────────────

function u16(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}

function u32(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
}

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** CRC32 (IEEE 802.3, the ZIP polynomial) — java.util.zip verifies on close. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface CentralEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compSize: number;
  localOffset: number;
}

/** decodes the EOCD + central directory; throws the format error on any structural surprise */
function centralDirectory(zip: Uint8Array): { entries: CentralEntry[] } {
  // locate the EOCD: scan the last 65 557 bytes (max comment 65 535 + 22)
  const scanStart = Math.max(0, zip.length - 65_557);
  let eocd = -1;
  for (let i = zip.length - 22; i >= scanStart; i--) {
    if (u32(zip, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ArchiveFormatError("EOCD not found");
  const totalEntries = u16(zip, eocd + 10);
  const cdSize = u32(zip, eocd + 12);
  const cdOffset = u32(zip, eocd + 16);

  const entries: CentralEntry[] = [];
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > cdEnd || p + 46 > zip.length || u32(zip, p) !== CD_SIG) {
      throw new ArchiveFormatError("bad central directory entry " + i);
    }
    const flags = u16(zip, p + 8);
    const method = u16(zip, p + 10);
    const crc = u32(zip, p + 16);
    const compSize = u32(zip, p + 20);
    const nameLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const commentLen = u16(zip, p + 32);
    const localOffset = u32(zip, p + 42);
    if (p + 46 + nameLen > zip.length) throw new ArchiveFormatError("truncated entry name");
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, flags, method, crc, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries };
}

/**
 * Structural traversal guard (ZipSafety.java:129-145): rejects absolute
 * paths, any `..` path segment (on either separator), backslash separators,
 * and drive-letter prefixes. Plain names containing dots stay legal — only
 * segments that RESOLVE upward are refused.
 */
function requireSafeName(name: string): void {
  if (name === null || name === undefined || name.trim() === "") {
    throw new ZipBudgetError("archive contains an entry with an empty name");
  }
  if (
    name.includes("\\") ||
    name.startsWith("/") ||
    (name.length >= 2 && /[A-Za-z]/.test(name.charAt(0)) && name.charAt(1) === ":")
  ) {
    throw new ZipBudgetError("archive contains an unsafe entry path: " + safeNameForLog(name));
  }
  for (const segment of name.split("/")) {
    if (segment === "..") {
      throw new ZipBudgetError("archive contains an unsafe entry path: " + safeNameForLog(name));
    }
  }
}

/** log-safe name rendering: bounded length, the frozen "…" truncation mark */
function safeNameForLog(name: string): string {
  return name.length > 100 ? name.slice(0, 100) + "…" : name;
}

/**
 * Streams every non-directory entry of the archive through `consumer` under
 * the given budgets (ZipSafety.readEach). Throws ZipBudgetError (a
 * BadRequestError) when a budget is exceeded or an entry name is
 * structurally unsafe; ArchiveFormatError for genuinely malformed archives.
 */
export function readEach(
  zipBytes: Uint8Array,
  limits: ZipLimits,
  consumer: ZipEntryConsumer,
): void {
  const { entries } = centralDirectory(zipBytes);

  let total = 0;
  let visited = 0;
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue; // directory — skipped BEFORE counting (:79-81)
    if (++visited > limits.maxEntries) {
      throw new ZipBudgetError("archive contains more than " + limits.maxEntries + " entries");
    }
    requireSafeName(entry.name);
    if (entry.flags & 0x1) throw new ArchiveFormatError("encrypted entry");
    if (entry.method !== 0 && entry.method !== 8) {
      throw new ArchiveFormatError("unsupported compression method " + entry.method);
    }

    // local header: name/extra lengths there are authoritative for the data offset
    const off = entry.localOffset;
    if (off + 30 > zipBytes.length || u32(zipBytes, off) !== LFH_SIG) {
      throw new ArchiveFormatError("bad local header for " + safeNameForLog(entry.name));
    }
    const nameLen = u16(zipBytes, off + 26);
    const extraLen = u16(zipBytes, off + 28);
    const dataStart = off + 30 + nameLen + extraLen;
    if (dataStart + entry.compSize > zipBytes.length) {
      throw new ArchiveFormatError("truncated entry data for " + safeNameForLog(entry.name));
    }
    const compressed = zipBytes.subarray(dataStart, dataStart + entry.compSize);

    let data: Uint8Array;
    if (entry.method === 0) {
      data = compressed; // stored — subarray, no copy; budget checks below
    } else {
      // the decompressor refuses to grow past the per-entry cap (the
      // frozen walker aborts mid-stream; same boundary, same message)
      try {
        data = inflateRawSync(compressed, { maxOutputLength: limits.maxEntryBytes });
      } catch (e) {
        if (
          e instanceof Error &&
          ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ||
            /buffer too large/i.test(e.message))
        ) {
          throw new ZipBudgetError(
            "archive entry '" + entry.name + "' decompresses beyond the " +
              limits.maxEntryBytes + " byte per-entry budget",
          );
        }
        throw new ArchiveFormatError("corrupt deflate stream");
      }
    }
    // post-checks hold the exact frozen boundary even if the runtime
    // ignored maxOutputLength — per-entry first (Java checks it first
    // inside every chunk read), then the rolling total (:89-92, :109-117)
    if (data.length > limits.maxEntryBytes) {
      throw new ZipBudgetError(
        "archive entry '" + entry.name + "' decompresses beyond the " +
          limits.maxEntryBytes + " byte per-entry budget",
      );
    }
    if (total + data.length > limits.maxTotalBytes) {
      throw new ZipBudgetError(
        "archive decompresses beyond the " + limits.maxTotalBytes + " byte total budget",
      );
    }
    if (crc32(data) !== entry.crc) {
      throw new ArchiveFormatError("CRC mismatch on " + safeNameForLog(entry.name));
    }
    total += data.length;
    consumer(entry.name, data);
  }
}
