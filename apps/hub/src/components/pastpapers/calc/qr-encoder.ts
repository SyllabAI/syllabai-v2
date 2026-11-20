/**
 * qr-encoder.ts — T-MG-CALC-2 phase B: the QR encoder for the CW shell's
 * QR key (the chase ruling moved the key to phase B: "no verifiable QR
 * encoder exists in the repo and an unverifiable QR is dishonest").
 *
 * VERIFIABILITY is the design law, in two layers:
 *  1. qr-encoder.test.ts pins GOLDEN MATRICES cross-checked against an
 *     INDEPENDENT implementation (the Python qrcode library) for real
 *     calculator result strings, plus structural invariants (finder/
 *     timing/alignment/dark module, format-info BCH round-trip, RS
 *     syndromes of every block = 0 — a mathematical proof the codewords
 *     are valid Reed–Solomon).
 *  2. The scope is deliberately small and fully specified: byte mode
 *     (UTF-8), versions 1–6, error correction level M, all 8 masks
 *     scored by the standard penalty rules. A calculator's displayed
 *     result (≤ ~100 chars) fits version 6-M's 108 data codewords with
 *     room to spare; larger payloads refuse honestly (a null result —
 *     never a truncated or fake code).
 *
 * EXAM HONESTY: the real device's QR key encodes a Casio web-service
 * URL. Ours encodes the DISPLAYED RESULT as plain text — the component's
 * QR screen says so verbatim; no Casio affiliation is implied.
 */

// ── GF(256) arithmetic (primitive polynomial 0x11D) ────────────────────

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** generator polynomial of degree n (the RS error-correction divisor),
 * big-endian (leading coefficient first — matching the synthetic
 * division in rsRemainder). g(x) = Π (x + α^i) for i < n. */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]; // × x — big-endian: the shift moves DOWN an index
      next[j + 1] ^= gfMul(poly[j], EXP[i]); // × α^i
    }
    poly = next;
  }
  return poly;
}

/** the RS remainder (error-correction codewords) of a data block. */
function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const buf = data.concat(new Array<number>(degree).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], factor);
  }
  return buf.slice(data.length);
}

// ── version tables (1–6, ECL M) ────────────────────────────────────────

const VERSION_DATA_CODEWORDS = [16, 28, 44, 64, 86, 108];
/** blocks of (data codewords, EC codewords) at ECL M. */
const VERSION_BLOCKS: Array<Array<[number, number]>> = [
  [[16, 10]],
  [[28, 16]],
  [[44, 26]],
  [
    [32, 18],
    [32, 18],
  ],
  [
    [43, 24],
    [43, 24],
  ],
  [
    [27, 16],
    [27, 16],
    [27, 16],
    [27, 16],
  ],
];
const ALIGNMENT_COORDS: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
/** v1 has none; v2–v6 have 7 remainder bits. */
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7];

// ── bit buffer + segment encoding ──────────────────────────────────────

class BitBuffer {
  bits: number[] = [];
  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** the full data bitstream for byte mode, or null when it cannot fit
 * (honest refusal — the component shows the honest line, never a fake). */
function encodePayload(text: string, version: number): number[] | null {
  const data = utf8Bytes(text);
  const capacity = VERSION_DATA_CODEWORDS[version - 1];
  const capBits = capacity * 8;
  // mode(4) + count(8) + payload must fit BEFORE the terminator is cut
  if (12 + 8 * data.length > capBits) return null;
  const bb = new BitBuffer();
  bb.push(0b0100, 4); // byte mode
  bb.push(data.length, 8); // char count (versions 1–9)
  for (const b of data) bb.push(b, 8);
  // terminator (≤ 4 bits), then byte alignment
  bb.push(0, Math.min(4, capBits - bb.bits.length));
  if (bb.bits.length % 8 !== 0) bb.push(0, 8 - (bb.bits.length % 8));
  // pad codewords EC 11 alternating
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bb.bits.length < capBits) bb.push(padBytes[padIdx++ % 2], 8);
  // pack
  const out: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bb.bits[i + j];
    out.push(b);
  }
  return out;
}

// ── the module matrix ──────────────────────────────────────────────────

export interface QrCode {
  version: number;
  size: number;
  /** true = dark module. */
  modules: boolean[][];
}

function makeMatrix(version: number): boolean[][] {
  const size = version * 4 + 17;
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function drawFunctionPatterns(m: boolean[][], version: number): void {
  const size = m.length;
  const finder = (r: number, c: number) => {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const rr = r + i;
        const cc = c + j;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const dark = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
        m[rr][cc] = dark;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  // separators are drawn by finder's -1 ring (light); timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    m[6][i] = dark;
    m[i][6] = dark;
  }
  // alignment patterns (v ≥ 2), skipping finder overlaps
  const coords = ALIGNMENT_COORDS[version - 1];
  for (const r of coords) {
    for (const c of coords) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1;
        }
      }
    }
  }
  // the dark module (4·version + 9, 8) — spec-mandated, tested
  m[4 * version + 9][8] = true;
}

/** reserve areas + zigzag placement, then mask the data region. */
function drawCodewords(m: boolean[][], codewords: number[], version: number, mask: number): void {
  const size = m.length;
  // bit index per (row, col) in zigzag order — computed over the data region
  const totalDataBits = codewords.length * 8;
  let bitIdx = 0;
  for (let colPair = size - 1; colPair > 0; colPair -= 2) {
    if (colPair === 6) colPair--; // skip the timing column
    // the spec's direction law: the pair reads UP when ((colPair + 1) & 2)
    // is 0 — the first (bottom-right) pair reads upward, alternating from
    // the column index, NOT from a per-pair toggle
    const upward = ((colPair + 1) & 2) === 0;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < 2; j++) {
        const c = colPair - j;
        const r = upward ? size - 1 - i : i;
        if (isFunctionModule(m, r, c, version)) continue;
        let dark = false;
        if (bitIdx < totalDataBits) {
          const byteIdx = bitIdx >> 3;
          const bitPos = 7 - (bitIdx & 7);
          dark = ((codewords[byteIdx] >>> bitPos) & 1) === 1;
          bitIdx++;
        }
        m[r][c] = applyMask(mask, r, c, dark);
      }
    }
  }
}

const MASKS: Array<(i: number, j: number) => boolean> = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function applyMask(mask: number, i: number, j: number, dark: boolean): boolean {
  return MASKS[mask](i, j) ? !dark : dark;
}

/** is (r, c) a function module? Function patterns are drawn FIRST; the
 * zigzag must skip them. Format areas are the only reserved regions NOT
 * yet drawn when placement runs — detect them by position. */
function isFunctionModule(m: boolean[][], r: number, c: number, version: number): boolean {
  const size = m.length;
  // finders + separators + timing: any module in their bounding regions
  if (r === 6 || c === 6) return true;
  if (r <= 8 && c <= 8) return true;
  if (r <= 8 && c >= size - 8) return true;
  if (r >= size - 8 && c <= 8) return true;
  // alignment patterns (v ≥ 2)
  const coords = ALIGNMENT_COORDS[version - 1];
  for (const ar of coords) {
    for (const ac of coords) {
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
      if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
    }
  }
  void m;
  return false;
}

/** draw the 15-bit format info (ECL M = 00, the mask, BCH + mask XOR) —
 * the spec's placement: the vertical copy runs bit 0 (LSB) down column 8
 * from row 0, the horizontal copy runs bit 0 across row 8 from column
 * size−1 (cross-checked against the independent oracle implementation's
 * placement; the dark module re-asserted last). */
function drawFormatInfo(m: boolean[][], mask: number): void {
  const size = m.length;
  const data = (0b00 << 3) | mask; // ECL M = 00
  let rem = data << 10;
  const g = 0b10100110111;
  for (let i = 14; i >= 10; i--) if (((rem >> i) & 1) !== 0) rem ^= g << (i - 10);
  const bits = (((data << 10) | rem) ^ 0b101010000010010) & 0x7fff;
  const bit = (k: number): boolean => ((bits >> k) & 1) === 1;
  // the vertical copy: bits 0–5 rows 0–5, bits 6–7 rows 7–8, bits 8–14
  // rows size−7 … size−1 (all at column 8)
  for (let i = 0; i < 15; i++) {
    if (i < 6) m[i][8] = bit(i);
    else if (i < 8) m[i + 1][8] = bit(i);
    else m[size - 15 + i][8] = bit(i);
  }
  // the horizontal copy: bits 0–7 cols size−1 … size−8, bit 8 col 7,
  // bits 9–14 cols 5 … 0 (col 6 belongs to the timing row, not format)
  for (let i = 0; i < 15; i++) {
    if (i < 8) m[8][size - 1 - i] = bit(i);
    else if (i === 8) m[8][7] = bit(i);
    else m[8][14 - i] = bit(i);
  }
  m[size - 8][8] = true; // the dark module (4·version + 9, 8) — always dark
}

/** the standard four penalty scores (N1–N4). */
function maskPenalty(m: boolean[][]): number {
  const size = m.length;
  let penalty = 0;
  const linePenalty = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let runColor = get(a, 0);
      let runLen = 1;
      for (let b = 1; b < size; b++) {
        const cur = get(a, b);
        if (cur === runColor) {
          runLen++;
          if (b === size - 1 && runLen >= 5) penalty += 3 + (runLen - 5);
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = cur;
          runLen = 1;
        }
      }
    }
  };
  linePenalty((a, b) => m[a][b]);
  linePenalty((a, b) => m[b][a]);
  // N2: 2×2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) penalty += 3;
    }
  }
  // N3: the finder-like run pattern with 4 light on one side
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const runScan = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      for (let b = 0; b <= size - 11; b++) {
        const match1 = pat1.every((p, k) => get(a, b + k) === p);
        const match2 = pat2.every((p, k) => get(a, b + k) === p);
        if (match1 || match2) penalty += 40;
      }
    }
  };
  runScan((a, b) => m[a][b]);
  runScan((a, b) => m[b][a]);
  // N4: dark proportion
  let darkCount = 0;
  for (const row of m) for (const v of row) if (v) darkCount++;
  const total = size * size;
  const percent = (darkCount * 100) / total;
  const dev = Math.floor(Math.abs(percent - 50) / 5);
  penalty += dev * 10;
  return penalty;
}

/** encode text → the QR matrix. Returns null when the payload cannot fit
 * versions 1–6 M (the honest refusal). `opts.mask` forces a specific
 * mask (the verification battery drives it — every forced matrix must
 * equal the independent oracle's at the same mask); without it the best
 * penalty-scoring mask is chosen. */
export function qrEncode(text: string, opts: { mask?: number } = {}): QrCode | null {
  if (text.length === 0 || text.length > 106) return null;
  let chosen: { version: number; codewords: number[] } | null = null;
  for (let version = 1; version <= 6; version++) {
    const payload = encodePayload(text, version);
    if (!payload) continue;
    const blocks = VERSION_BLOCKS[version - 1];
    const dataPer = blocks[0][0];
    const ecPer = blocks[0][1];
    // split the payload into the blocks (equal sizes at v1–6 M)
    const dataBlocks: number[][] = [];
    for (let b = 0; b < blocks.length; b++) dataBlocks.push(payload.slice(b * dataPer, (b + 1) * dataPer));
    const ecBlocks = dataBlocks.map((d) => rsRemainder(d, ecPer));
    // interleave: data codewords round-robin, then EC round-robin
    const interleaved: number[] = [];
    for (let i = 0; i < dataPer; i++) for (const d of dataBlocks) interleaved.push(d[i]);
    for (let i = 0; i < ecPer; i++) for (const e of ecBlocks) interleaved.push(e[i]);
    chosen = { version, codewords: interleaved };
    break;
  }
  if (!chosen) return null;
  const { version, codewords } = chosen;
  if (opts.mask !== undefined) {
    const mask = opts.mask;
    if (!Number.isInteger(mask) || mask < 0 || mask > 7) return null;
    const m = makeMatrix(version);
    drawFunctionPatterns(m, version);
    drawCodewords(m, codewords, version, mask);
    drawFormatInfo(m, mask);
    return { version, size: version * 4 + 17, modules: m };
  }
  // pick the best mask by the penalty score
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules: boolean[][] | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = makeMatrix(version);
    drawFunctionPatterns(m, version);
    drawCodewords(m, codewords, version, mask);
    drawFormatInfo(m, mask);
    const p = maskPenalty(m);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
      bestModules = m;
    }
  }
  return { version, size: version * 4 + 17, modules: bestModules! };
}

/** read the codewords back OUT of a matrix (the inverse of the zigzag
 * placement — the verification battery's proof layer: the matrix itself
 * must decode to codewords whose RS syndromes are all zero). */
export function readCodewords(modules: boolean[][], version: number, mask: number): { data: number[]; ec: number[] } {
  const size = modules.length;
  const blocks = VERSION_BLOCKS[version - 1];
  const dataPer = blocks[0][0];
  const ecPer = blocks[0][1];
  const totalBytes = blocks.length * (dataPer + ecPer);
  const bits: number[] = [];
  let isFunctionCache: boolean[][] | null = null;
  // the mask must be UN-applied for the read: XOR back with the same mask
  for (let colPair = size - 1; colPair > 0; colPair -= 2) {
    if (colPair === 6) colPair--;
    const upward = ((colPair + 1) & 2) === 0;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < 2; j++) {
        const c = colPair - j;
        const r = upward ? size - 1 - i : i;
        if (isFunctionModule(modules, r, c, version)) continue;
        const masked = modules[r][c];
        const unmasked = MASKS[mask](r, c) ? !masked : masked;
        bits.push(unmasked ? 1 : 0);
      }
    }
  }
  void isFunctionCache;
  const bytes: number[] = [];
  for (let i = 0; i < totalBytes * 8; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
    bytes.push(b);
  }
  const split = blocks.length * dataPer;
  return { data: bytes.slice(0, split), ec: bytes.slice(split) };
}

/** the RS syndromes of a block — ALL ZERO for a valid codeword. Exported
 * for the test battery's mathematical verification layer. */
export function rsSyndromes(block: number[], degree: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < degree; i++) {
    let s = 0;
    for (const b of block) s = gfMul(s, EXP[i]) ^ b;
    out.push(s);
  }
  return out;
}

/** decode the 15-bit format info from a matrix (BCH-checked) — exported
 * for the test battery's round-trip pin. Reads the spec placement (the
 * vertical copy down column 8 LSB-first, the horizontal copy across row
 * 8 from the right). Returns the ECL bits and mask. */
export function readFormatInfo(m: boolean[][]): { eclBits: number; mask: number } | null {
  const size = m.length;
  const placed: boolean[] = new Array(15).fill(false);
  for (let i = 0; i < 15; i++) {
    if (i < 6) placed[i] = m[i][8];
    else if (i < 8) placed[i] = m[i + 1][8];
    else placed[i] = m[size - 15 + i][8];
  }
  let bits = 0;
  for (let k = 14; k >= 0; k--) bits = (bits << 1) | (placed[k] ? 1 : 0);
  const unmasked = bits ^ 0b101010000010010;
  const dataBits = unmasked >> 10;
  // BCH check: re-encode and compare
  let rem = dataBits << 10;
  const g = 0b10100110111;
  for (let i = 14; i >= 10; i--) if (((rem >> i) & 1) !== 0) rem ^= g << (i - 10);
  if ((((dataBits << 10) | rem) ^ 0b101010000010010) !== bits) return null;
  return { eclBits: (dataBits >> 3) & 3, mask: dataBits & 7 };
}

