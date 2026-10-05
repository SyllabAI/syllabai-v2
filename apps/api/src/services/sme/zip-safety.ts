/**
 * Bounded ZIP entry walker — port of com.syllabai.shared.ZipSafety
 * (:32-153 @ 6cad6ef) for the SME corpus ingest (T-MIG-033 tranche-3).
 * The JVM half of this (ZipInputStream streaming) is reimplemented as a
 * local-header walker over node:zlib.
 *
 * Why absolute budgets (class javadoc :9-31, deep-audit 09-28 M3): the
 * compressed multipart cap bounds nothing — compression ratio is
 * attacker-chosen, and a reader that allocates the full uncompressed entry
 * before any check would OOM on a 42 KB ZIP bomb. Three absolute budgets
 * are enforced WITHOUT allocating past a cap:
 *   - per-entry uncompressed ceiling (default 64 MB, :35) — enforced by
 *     running inflateRawSync with maxOutputLength, so a bomb entry aborts
 *     AT the cap (the exact property the JVM chunked read had, :98-121);
 *   - total uncompressed ceiling across all entries (default 256 MB, :37)
 *     — checked per entry against the REAL decompressed length, mirroring
 *     the JVM's during-streaming check (:89-92, :114-117);
 *   - entry-count ceiling (default 10 000, :39).
 * All three fail closed with the verbatim budget messages (:83-92, :109-117).
 *
 * Structural traversal guard verbatim (:129-145): absolute paths, any `..`
 * segment (on either separator), backslash separators, drive-letter
 * prefixes; plain names containing dots (a..b.png) stay legal.
 *
 * CRC32 verified per entry after decompression — ZipInputStream.readAllBytes
 * verifies the recorded CRC and surfaces a mismatch as an IOException, which
 * the caller translates into the "could not read the corpus package (not a
 * ZIP?)" 400 (SmeQuestionIngestService :602-614); ZipFormatError here is
 * that IOException class.
 *
 * Disclosed deviation (fail-closed): ZipInputStream also accepts STREAMED
 * entries whose sizes live in a trailing data descriptor (general-purpose
 * flag bit 3); this walker refuses them ("archive uses streamed entries
 * (data descriptors) — unsupported"). The production builder
 * (scripts/s104_build_question_package.py) writes seekable-output zips with
 * header sizes, so no real package regresses; the refusal is the defensive
 * direction on hand-crafted archives only. Encrypted entries (flag bit 0)
 * fail as ZipFormatError — the same not-a-ZIP class the JVM's decrypt-less
 * reader produces.
 */
import { inflateRawSync } from "node:zlib";
import { BadRequestError } from "../selfmark";

/** default per-entry uncompressed ceiling (matches the multipart cap, :35) */
export const ZIP_DEFAULT_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
/** default total uncompressed ceiling across all entries in one archive (:37) */
export const ZIP_DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** default entry-count ceiling (:39) */
export const ZIP_DEFAULT_MAX_ENTRIES = 10_000;

export interface ZipLimits {
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxEntries: number;
}

export function zipLimitsDefaults(): ZipLimits {
  return {
    maxEntryBytes: ZIP_DEFAULT_MAX_ENTRY_BYTES,
    maxTotalBytes: ZIP_DEFAULT_MAX_TOTAL_BYTES,
    maxEntries: ZIP_DEFAULT_MAX_ENTRIES,
  };
}

/** consumer for each non-directory entry (name = raw entry name) (:56-59) */
export type ZipEntryConsumer = (name: string, data: Uint8Array) => void;

/**
 * The ZipInputStream IOException class: genuinely malformed archive structure
 * (bad signatures, truncated data, CRC mismatch, encryption). The CALLER
 * translates it into the 400 "could not read the corpus package (not a
 * ZIP?)" — budget/traversal/name failures throw BadRequestError directly
 * (they are BadRequestException in the JVM, :83-92, :131-143).
 */
export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipFormatError";
  }
}

// ── CRC32 (the ZipInputStream verification the port must reproduce) ────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── little-endian readers over the raw archive bytes ────────────────────────

const SIG_LOCAL = 0x04034b50; // PK\x03\x04
const SIG_CENTRAL = 0x02014b50; // PK\x01\x02 — the walker's stop marker
const SIG_EOCD = 0x06054b50; // PK\x05\x06

function u16(view: DataView, off: number): number {
  return view.getUint16(off, true);
}
function u32(view: DataView, off: number): number {
  return view.getUint32(off, true);
}

const decoder = new TextDecoder();

/** log-safe name rendering: bounded length, UTF-8 for the message (:147-152) */
function safeNameForLog(name: string): string {
  const rendered = Buffer.from(name, "utf8").toString("utf8");
  return rendered.length > 100 ? rendered.slice(0, 100) + "…" : rendered;
}

/**
 * Structural traversal guard verbatim (:129-145): empty names, backslash
 * separators, absolute paths, drive-letter prefixes, and any `..` segment
 * (segments that RESOLVE upward) are refused; `a..b.png` stays legal.
 */
function requireSafeName(name: string): void {
  if (name === null || name === undefined || name.trim() === "") {
    throw new BadRequestError("archive contains an entry with an empty name");
  }
  if (
    name.includes("\\") ||
    name.startsWith("/") ||
    (name.length >= 2 && /[A-Za-z]/.test(name.charAt(0)) && name.charAt(1) === ":")
  ) {
    throw new BadRequestError(
      "archive contains an unsafe entry path: " + safeNameForLog(name),
    );
  }
  for (const segment of name.split("/")) {
    if (segment === "..") {
      throw new BadRequestError(
        "archive contains an unsafe entry path: " + safeNameForLog(name),
      );
    }
  }
}

function perEntryBudgetError(name: string, limit: number): BadRequestError {
  return new BadRequestError(
    `archive entry '${name}' decompresses beyond the ${limit} byte per-entry budget`,
  );
}

function totalBudgetError(limit: number): BadRequestError {
  return new BadRequestError(
    `archive decompresses beyond the ${limit} byte total budget`,
  );
}

/**
 * Streams every non-directory entry of the archive through `consumer` under
 * the given budgets (:72-96). Throws BadRequestError when a budget is
 * exceeded or an entry name is structurally unsafe; ZipFormatError for
 * genuinely malformed archives (callers translate to the not-a-ZIP 400).
 */
export function readEachZip(
  zipBytes: Uint8Array,
  limits: ZipLimits,
  consumer: ZipEntryConsumer,
): void {
  let off = 0;
  let entries = 0;
  let total = 0;
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  );

  for (;;) {
    if (off + 4 > zipBytes.length) throw new ZipFormatError("truncated archive");
    const sig = u32(view, off);
    if (sig === SIG_CENTRAL || sig === SIG_EOCD) {
      // the local-entry sequence ended — ZipInputStream stops here too
      return;
    }
    if (sig !== SIG_LOCAL) {
      throw new ZipFormatError("bad local header signature");
    }
    if (off + 30 > zipBytes.length) throw new ZipFormatError("truncated local header");

    const flags = u16(view, off + 6);
    const method = u16(view, off + 8);
    const crc = u32(view, off + 14);
    const compressedSize = u32(view, off + 18);
    const uncompressedSize = u32(view, off + 22);
    const nameLen = u16(view, off + 26);
    const extraLen = u16(view, off + 28);

    if (flags & 0x8) {
      // sizes live in a trailing data descriptor — see the disclosed
      // deviation note (fail-closed; production packages carry header sizes)
      throw new BadRequestError(
        "archive uses streamed entries (data descriptors) — unsupported",
      );
    }
    if (flags & 0x1) {
      throw new ZipFormatError("encrypted entries are not supported");
    }

    const nameStart = off + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipBytes.length) throw new ZipFormatError("truncated entry data");

    const name = decoder.decode(zipBytes.subarray(nameStart, nameStart + nameLen));
    off = dataEnd;

    if (name.endsWith("/")) {
      // directory entry (:79-82)
      continue;
    }
    entries++;
    if (entries > limits.maxEntries) {
      throw new BadRequestError(
        `archive contains more than ${limits.maxEntries} entries`,
      );
    }
    requireSafeName(name);

    let data: Uint8Array;
    if (method === 0) {
      // stored — the fast path of the JVM chunked read (:100-121)
      if (dataEnd - dataStart > limits.maxEntryBytes) {
        throw perEntryBudgetError(name, limits.maxEntryBytes);
      }
      data = zipBytes.subarray(dataStart, dataEnd);
    } else if (method === 8) {
      // deflate — maxOutputLength enforces the per-entry budget DURING
      // inflation: no allocation past the cap (the M3 law, :16-24, :98-121)
      if (uncompressedSize > limits.maxEntryBytes) {
        throw perEntryBudgetError(name, limits.maxEntryBytes);
      }
      const compressed = zipBytes.subarray(dataStart, dataEnd);
      try {
        data = inflateRawSync(compressed, {
          maxOutputLength: limits.maxEntryBytes + 1,
        });
      } catch {
        throw new ZipFormatError(`entry '${name}' failed to inflate`);
      }
      if (data.length > limits.maxEntryBytes) {
        // lying size header — the real length still obeys the cap
        throw perEntryBudgetError(name, limits.maxEntryBytes);
      }
    } else {
      throw new ZipFormatError(`unsupported compression method ${method}`);
    }

    if (total + data.length > limits.maxTotalBytes) {
      throw totalBudgetError(limits.maxTotalBytes);
    }
    if (crc32(data) !== crc) {
      throw new ZipFormatError(`entry '${name}' failed CRC verification`);
    }

    total += data.length;
    consumer(name, data);
  }
}
