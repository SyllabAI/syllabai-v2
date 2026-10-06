/**
 * Output hygiene + incremental stream sanitizer (T-MIG-060 tranche 1) —
 * frozen sources @ 6cad6ef, line-against-line:
 *   - GroundedTutorGenerator.sanitizeAnswer :482-514 (+ CITATION_MARKER :96-97)
 *   - StreamSanitizer.java :39-165 (the holdback-window algorithm)
 *
 * The blocking path sanitizes the COMPLETE answer: echoed fence markers and
 * out-of-range citation markers are stripped before anything reaches the
 * learner. A token stream cannot do that — deltas must leave while the
 * answer is still arriving — so the stream path holds text back to the last
 * whitespace (markers contain no whitespace, so a whitespace cut can never
 * split one) and flushes the tail through the EXACT blocking sanitizer at
 * stream end.
 *
 * PARITY PROPERTY (StreamSanitizer javadoc :30-34): for every answer whose
 * text arrives in any delta split, the concatenation of emitted segments
 * equals sanitizeAnswer(fullText) — except for text inside a space-free run
 * longer than ABS_PENDING chars containing a partial marker at the forced
 * cut (cosmetic residue at worst; unreachable for real answers).
 */

/** Citation markers whose number indexes the citation list (H2 output
 *  hygiene): 1–3 digit [n]/【n】. Java: [\[\u3010]([0-9]{1,3})[\]\u3011] :96-97 */
const CITATION_MARKER = /[\u{005B}\u{3010}]([0-9]{1,3})[\u{005D}\u{3011}]/gu;

export type StrippedCitationSink = ((n: number) => void) | null;

/**
 * sanitizeAnswer (deep-audit 09-28 H2): removes echoed fence markers (the
 * system prompt forbids them; this enforces it deterministically) and strips
 * every [n]/【n】 marker whose number falls OUTSIDE [1..evidenceCount] — a
 * marker bound to a nonexistent evidence slot is either a model slip or the
 * residue of a citation-forgery attempt, and it never reaches the learner.
 * In-range markers pass through byte-identical. The sink-carrying variant is
 * observation-only: the OUTPUT is byte-identical to the 4-arg form (:487-491).
 */
export function sanitizeAnswer(
  text: string | null,
  evidenceCount: number,
  fenceOpen: string,
  fenceClose: string,
  strippedCitationSink: StrippedCitationSink = null,
): string | null {
  if (text == null || text.length === 0) return text;
  let cleaned = text.split(fenceOpen).join("");
  cleaned = cleaned.split(fenceClose).join("");
  if (cleaned.length === 0) return cleaned;
  // Java StringBuilder+Matcher loop: every marker judged in place, in-range
  // kept verbatim (Matcher.quoteReplacement == the group itself), out-of-range
  // replaced with "" and reported to the sink.
  let out = "";
  let last = 0;
  CITATION_MARKER.lastIndex = 0;
  for (let m = CITATION_MARKER.exec(cleaned); m !== null; m = CITATION_MARKER.exec(cleaned)) {
    const digits = m[1];
    if (digits == null) {
      last = m.index + m[0].length;
      continue;
    }
    const n = parseInt(digits, 10);
    const inRange = n >= 1 && n <= evidenceCount;
    if (!inRange && strippedCitationSink != null) strippedCitationSink(n);
    out += cleaned.slice(last, m.index);
    if (inRange) out += m[0];
    last = m.index + m[0].length;
  }
  out += cleaned.slice(last);
  return out;
}

// ── StreamSanitizer (:39-165) ───────────────────────────────────────────────

/** buffered raw text beyond which a forced cut fires even without whitespace */
export const MAX_PENDING = 512;
/** absolute buffering bound — real tutor answers are ≤ ~2000 chars total */
export const ABS_PENDING = 8192;
/** chars always held back on a forced cut (covers any single marker) */
export const MIN_TAIL = 8;
/** longest marker lookback = the fence marker (25 chars) minus one :132-135 */
export const MARKER_LOOKBACK = 24;

const WHITESPACE = " \t\n\r\u000B\f";

/**
 * NOT thread-safe by design (single-subscription, serialized onNext). Used
 * inside the streaming pipeline; create one per ask.
 */
export class StreamSanitizer {
  private readonly evidenceCount: number;
  private readonly fenceOpen: string;
  private readonly fenceClose: string;
  private pending = "";
  /** T-C40 ③b: every out-of-range citation marker stripped, in removal order. */
  private readonly stripped: number[] = [];

  constructor(evidenceCount: number, fenceOpen: string, fenceClose: string) {
    this.evidenceCount = evidenceCount;
    this.fenceOpen = fenceOpen;
    this.fenceClose = fenceClose;
  }

  /**
   * Absorb one raw delta; return the sanitized text safe to emit now
   * (possibly empty — when everything received could still be the beginning
   * of a marker, nothing is emitted yet). push :71-91.
   */
  push(chunk: string | null | undefined): string {
    if (chunk == null || chunk.length === 0) return "";
    this.pending += chunk;
    if (this.pending.length > ABS_PENDING) {
      // unreachable for real answers; emit everything but the held tail
      // and accept the documented cosmetic risk rather than buffer forever
      return this.emitTo(this.pending.length - MIN_TAIL);
    }
    const cut = this.lastWhitespace();
    if (cut >= 0) return this.emitTo(cut);
    if (this.pending.length > MAX_PENDING) {
      // space-free run beyond the window: force progress at a marker-safe point
      return this.emitTo(this.retreatFromMarkerOpenings(this.pending.length - MIN_TAIL));
    }
    return "";
  }

  /** End of stream: flush the held tail through the exact blocking sanitizer. */
  flush(): string {
    const rest = sanitizeAnswer(
      this.pending,
      this.evidenceCount,
      this.fenceOpen,
      this.fenceClose,
      (n) => this.stripped.push(n),
    );
    this.pending = "";
    return rest == null ? "" : rest;
  }

  /** Every out-of-range citation marker stripped so far, in removal order. */
  strippedCitations(): number[] {
    return [...this.stripped];
  }

  private lastWhitespace(): number {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (WHITESPACE.includes(this.pending.charAt(i))) return i;
    }
    return -1;
  }

  /**
   * Emit pending[0..cut) after stripping complete markers from it. The cut
   * must not split a marker: whitespace cuts cannot (no marker contains
   * whitespace); forced cuts are pre-retreated past any potential marker
   * opening. cut <= 0 emits nothing. emitTo :117-130.
   */
  private emitTo(cut: number): string {
    if (cut <= 0) return "";
    const prefix = this.pending.slice(0, cut);
    this.pending = this.pending.slice(cut);
    return (
      sanitizeAnswer(
        prefix,
        this.evidenceCount,
        this.fenceOpen,
        this.fenceClose,
        (n) => this.stripped.push(n),
      ) ?? ""
    );
  }

  /**
   * Move a forced cut left past every character that could OPEN a marker
   * ([, 【, <) inside the MARKER_LOOKBACK window it would otherwise split.
   * The LOWEST opening in the window wins: a "<<<" run is one marker's
   * opening, and stopping at its last '<' would still emit a partial marker.
   * retreatFromMarkerOpenings :145-154.
   */
  private retreatFromMarkerOpenings(cut: number): number {
    let lowest = -1;
    const start = Math.max(0, cut - MARKER_LOOKBACK);
    for (let i = cut - 1; i >= start; i--) {
      const c = this.pending.charAt(i);
      if (c === "[" || c === "\u3010" || c === "<") lowest = i;
    }
    return lowest >= 0 ? lowest : Math.max(0, cut);
  }
}

/** Convenience for tests: push every chunk and collect what was emitted. */
export function streamThrough(sanitizer: StreamSanitizer, chunks: string[]): string {
  let out = "";
  for (const chunk of chunks) out += sanitizer.push(chunk);
  out += sanitizer.flush();
  return out;
}
