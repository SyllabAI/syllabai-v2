/**
 * DC-5 — the conformance lint (spec §3.5 P2; prereg of record
 * docs/DC5-CONFORMANCE-LINT-PLAN.md §4.4, operator trace
 * 1a164e7ccff41b2d "Proceed").
 *
 * "A conformance lint, in the spirit of the existing stem-hygiene pass,
 * runs after tutor generation on marked-part turns: any point the tutor
 * claims was missed must exist in the scheme rows, and any alternative or
 * value it offers must exist in the set. … violations are stripped and
 * logged, mirroring how out-of-range citation markers are stripped today."
 *
 * POSTURE (all pinned):
 *   - deterministic, cheap, ZERO-WRITE (a serve-side projection, exactly
 *     like stem-hygiene and the citation-marker strip);
 *   - active exactly on marked-part turns — the caller passes the
 *     MarkContext (karag: context.markContext != null, the DC-2 tier-2
 *     trigger); tier-1 turns never reach this module;
 *   - Rule A (point-existence) is always active: a sentence that claims a
 *     point was missed and names a point identifier must name one of the
 *     part's scheme rows (the MarkContextPoint refs of record);
 *   - Rule B (set membership) is active PER POINT that carries a
 *     materialised surface (alternatives/numericValues — the
 *     mark_point_alternatives rows of record); a point without rows passes
 *     through and the pass-through is logged (prereg R-DC5-4 — honest
 *     telemetry, never a silent gate);
 *   - sentence-granular strip (the offending sentences only), mirroring
 *     the strip precedent's OBSERVED posture; FAIL-OPEN like stem-hygiene:
 *     a lint that would empty the answer returns the input unchanged (the
 *     violations stay in the report — logged, not served-silently);
 *   - precision-first grammars: ambiguous sentences pass through, never
 *     strip (stem-hygiene's own law: none may damage legitimate content);
 *   - the membership key is the R-DC5-2 canonical form (canonicalAnswer,
 *     shared with the extractor — ONE normalisation law of record).
 *
 * STREAMING: MarkConformanceStreamSanitizer composes AFTER the existing
 * StreamSanitizer (sanitize.ts) on tier-2 streams — complete sentences are
 * linted before emission; per-sentence decisions are final (the same
 * hold-back design as the fence-marker sanitizer). The blocking path is
 * the marked-part surface of record (the CLA plane generates blocking);
 * the streaming wrapper extends the same law to the ask-path stream.
 */

import { canonicalAnswer } from "../ingestion/acceptable-answers";
import type { MarkContext, MarkContextPoint } from "./mark-context";

/** The per-sentence facts shape (precomputed once per turn/stream). */
export interface PointFacts {
  ref: string;
  normRef: string;
  textNorm: string;
  membersNorm: string[];
  hasSurface: boolean;
  awarded: boolean;
}

/** One logged violation (the report never carries learner text). */
export interface ConformanceViolation {
  rule: "A" | "B";
  /** the associated scheme point's ref, when one resolved */
  ref: string | null;
  /** why: "unknown-point" (A) | "out-of-set-alternative" | "out-of-set-numeric" (B) */
  kind: string;
  /** the offending sentence, truncated — log evidence, not a transcript */
  excerpt: string;
}

export interface ConformanceResult {
  text: string;
  violations: ConformanceViolation[];
  /** sentences removed (0 under the empty-result fail-open) */
  stripped: number;
  /** points whose Rule B passed through for lack of a materialised surface */
  passThroughRefs: string[];
}

/** The telemetry shape (karag rides this on the TutorAnsweredEvent). */
export interface ConformanceReport {
  active: boolean;
  stripped: number;
  ruleA: number;
  ruleB: number;
  passThrough: number;
}

/** Sentence split: terminal punctuation or newline boundaries. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The label law mark-context already uses (case-fold, parens/spaces off). */
function normRef(s: string): string {
  return s.toLowerCase().replace(/[\s()]/g, "");
}

/** Miss-claim grammar (Rule A / the association window of Rule B). */
const MISS_CLAIM =
  /\b(?:miss(?:ed|ing)?|not\s+awarded|no\s+marks?\s+(?:awarded|given|for)|didn'?t\s+(?:get|earn|score|receive)|did\s+not\s+(?:get|earn|score|receive)|lost\s+(?:a|the|any)\s+mark|didn'?t\s+pick\s+up|did\s+not\s+pick\s+up)\b/i;

/** Global clone for the miss-furniture scan (Rule B's pre-cue residual). */
const MISS_CLAIM_G = new RegExp(MISS_CLAIM.source, "gi");

/** Numeric+unit surface (non-global .test form) — the B-kind law + the
 *  numeric candidate fallback. */
const NUMERIC_SURFACE = new RegExp(
  `\\b\\d+(?:\\.\\d+)?\\s*(?:\\u00b1\\s*\\d+(?:\\.\\d+)?)?\\s*(?:nm|\\u00b5m|um|mm|cm|m|km|\u00b0c|\u00b0f|k|%|ms|s|min|h|mg|g|kg|cm\u00b3|dm\u00b3|ml|l)(?=[^\\w]|$)`,
  "i",
);

/** "point X" identifier grammar (Rule A) — explicit mentions only. */
const POINT_MENTION = /\b(?:marking\s+point|mark\s+point|marks?\s+point|point)\s+([a-z0-9][a-z0-9.\-()]*)/gi;

/** Alternative-offer grammar (Rule B) — explicit offer language only. */
const OFFER_CUE =
  /\b(?:also\s+accept(?:able)?|would\s+also\s+(?:score|earn|gain|count|be\s+marked\s+correct)|alternative(?:ly)?(?:\s+answer)?|also\s+(?:be\s+)?acceptable|equally\s+acceptable|(?:is|are|would\s+be)\s+(?:also\s+)?acceptable)\b/i;

/** Quoted candidate spans outrank free-text extraction. */
const QUOTED = /[“"]([^”"]{2,200})[”"]|‘([^’]{2,200})’/g;

const MIN_SUBSTRING = 6;

function factsOf(points: MarkContextPoint[]): PointFacts[] {
  return points.map((p) => {
    const members = new Set<string>();
    const textNorm = canonicalAnswer(p.text);
    if (textNorm.length > 0) members.add(textNorm);
    for (const a of p.alternatives ?? []) {
      const n = canonicalAnswer(a);
      if (n.length > 0) members.add(n);
    }
    for (const v of p.numericValues ?? []) {
      const n = canonicalAnswer(v);
      if (n.length > 0) members.add(n);
    }
    return {
      ref: p.ref,
      normRef: normRef(p.ref),
      textNorm,
      membersNorm: [...members],
      hasSurface: (p.alternatives?.length ?? 0) + (p.numericValues?.length ?? 0) > 0,
      awarded: p.awarded,
    };
  });
}

/** The scheme-point identifier a sentence names, if any (Rule A). */
function namedPointRef(sentence: string, points: PointFacts[]): string | null {
  for (const m of sentence.matchAll(POINT_MENTION)) {
    const token = normRef(m[1] ?? "");
    if (token.length === 0) continue;
    const exact = points.find((p) => p.normRef === token);
    if (exact) return exact.ref; // in-set — existence proven
    // trailing-segment law: "point 2" matches the ref whose tail is "2"
    const tail = points.find((p) => {
      const segs = p.normRef.split(".");
      return segs.length > 1 && segs[segs.length - 1] === token;
    });
    if (tail) return tail.ref;
    return "\u0000unknown"; // explicit mention, no scheme row — Rule A fires
  }
  return null;
}

/** Rule B association: the sentence's own ref, else the unique missed point. */
function associate(sentence: string, points: PointFacts[]): PointFacts | null {
  const named = namedPointRef(sentence, points);
  if (named != null && named !== "\u0000unknown") {
    return points.find((p) => p.ref === named) ?? null;
  }
  const missed = points.filter((p) => !p.awarded);
  return missed.length === 1 ? missed[0]! : null; // ambiguous → pass-through
}

/** Rule B candidate spans, in priority order (all deterministic):
 *  quoted spans → the post-cue remainder → the sentence's numeric+unit
 *  tokens → the pre-cue residual after the last miss-verb (answer-shaped
 *  offers). Candidates shorter than MIN_SUBSTRING (canonical) are furniture
 *  and drop out; the strip fires only when EVERY candidate is out-of-set. */
function ruleBCandidates(sentence: string, cueIndex: number, cueLength: number): string[] {
  const candidates: string[] = [];
  for (const q of sentence.matchAll(QUOTED)) {
    const c = (q[1] ?? q[2] ?? "").trim();
    if (c.length > 0) candidates.push(c);
  }
  const post = sentence.slice(cueIndex + cueLength).trim();
  if (canonicalAnswer(post).length >= MIN_SUBSTRING) candidates.push(post);
  for (const m of sentence.matchAll(NUMERIC_SURFACE_G)) candidates.push(m[0].trim());
  const pre = sentence.slice(0, cueIndex);
  MISS_CLAIM_G.lastIndex = 0;
  let lastMiss = -1;
  for (const m of pre.matchAll(MISS_CLAIM_G)) {
    if (m.index != null) lastMiss = m.index + m[0].length;
  }
  const residual = (lastMiss >= 0 ? pre.slice(lastMiss) : pre).trim();
  if (canonicalAnswer(residual).length >= MIN_SUBSTRING) candidates.push(residual);
  return candidates.filter((c) => canonicalAnswer(c).length >= MIN_SUBSTRING);
}

/** Mixed learner-echo sentences pass through (precision-first: the offer
 *  may be the learner's own answer being confirmed — never strip those). */
const LEARNER_ECHO = /\byour\s+(?:answer|response|working|method)\b|\byou\s+(?:wrote|said|put)\b/i;

/** The global form of the numeric surface for matchAll. */
const NUMERIC_SURFACE_G = new RegExp(NUMERIC_SURFACE.source, "gi");

function excerptOf(sentence: string): string {
  return sentence.length > 120 ? sentence.slice(0, 117) + "..." : sentence;
}

/** Membership: equal-or-substring on the canonical form (generous to legit
 *  scheme quotes, pinned at MIN_SUBSTRING to avoid degenerate hits). */
function inSet(candidate: string, members: string[]): boolean {
  const c = canonicalAnswer(candidate);
  if (c.length === 0) return true; // nothing extractable — never strip
  return members.some((m) => m === c || (c.length >= MIN_SUBSTRING && m.includes(c)));
}

/**
 * lintSentence — the per-sentence law (NO fail-open): the decision unit
 * the streaming wrapper composes. The TURN-level fail-open lives in
 * lintMarkedPartTurn only.
 */
export function lintSentence(
  sentence: string,
  points: PointFacts[],
  passThroughRefs: string[],
): ConformanceViolation | null {
  let drop: ConformanceViolation | null = null;

  // ── Rule A — a claimed-missed point must exist in the scheme rows ──
  if (MISS_CLAIM.test(sentence)) {
    const named = namedPointRef(sentence, points);
    if (named === "\u0000unknown") {
      drop = { rule: "A", ref: null, kind: "unknown-point", excerpt: excerptOf(sentence) };
    }
  }

  // ── Rule B — offered alternatives/values must be in the set ──
  if (drop === null && OFFER_CUE.test(sentence)) {
    const point = associate(sentence, points);
    if (point != null) {
      if (!point.hasSurface) {
        if (!passThroughRefs.includes(point.ref)) passThroughRefs.push(point.ref);
      } else {
        const cueMatch = sentence.match(OFFER_CUE);
        const candidates =
          cueMatch && cueMatch.index != null
            ? ruleBCandidates(sentence, cueMatch.index, cueMatch[0].length)
            : [];
        if (
          candidates.length > 0 &&
          !LEARNER_ECHO.test(sentence) &&
          candidates.every((c) => !inSet(c, point.membersNorm))
        ) {
          drop = {
            rule: "B",
            ref: point.ref,
            kind: NUMERIC_SURFACE.test(sentence) ? "out-of-set-numeric" : "out-of-set-alternative",
            excerpt: excerptOf(sentence),
          };
        }
        // no extractable candidate, a learner-echo mix, or any in-set
        // candidate → pass-through (precision-first: never strip)
      }
    }
  }
  return drop;
}

/** Exposed for the streaming wrapper (the facts precomputed once). */
export function factsOfContext(ctx: MarkContext): PointFacts[] {
  return factsOf(ctx.points ?? []);
}

/**
 * lintMarkedPartTurn — the deterministic DC-5 law over one generated tutor
 * turn on a marked part. Pure; never throws; fails open AT THE TURN LEVEL
 * (an empty result returns the input unchanged — the per-sentence law
 * without that guard is lintSentence, the streaming wrapper's unit).
 */
export function lintMarkedPartTurn(text: string, ctx: MarkContext): ConformanceResult {
  const violations: ConformanceViolation[] = [];
  const passThroughRefs: string[] = [];
  if (text == null || ctx == null || !Array.isArray(ctx.points) || ctx.points.length === 0) {
    return { text: text ?? "", violations, stripped: 0, passThroughRefs };
  }
  const points = factsOf(ctx.points);
  const kept: string[] = [];
  let stripped = 0;

  for (const sentence of sentences(String(text))) {
    const drop = lintSentence(sentence, points, passThroughRefs);
    if (drop != null) {
      violations.push(drop);
      stripped++;
    } else {
      kept.push(sentence);
    }
  }

  // fail-open (the stem-hygiene law): an empty result returns the input
  // unchanged — the violations stay logged, nothing is served silently
  if (kept.length === 0 && stripped > 0) {
    return { text: String(text), violations, stripped: 0, passThroughRefs };
  }
  return { text: kept.join(" "), violations, stripped, passThroughRefs };
}

/** The telemetry projection (no learner text leaves the process). */
export function conformanceReport(result: ConformanceResult): ConformanceReport {
  return {
    active: true,
    stripped: result.stripped,
    ruleA: result.violations.filter((v) => v.rule === "A").length,
    ruleB: result.violations.filter((v) => v.rule === "B").length,
    passThrough: result.passThroughRefs.length,
  };
}

/**
 * MarkConformanceStreamSanitizer — the streaming half of the same law:
 * buffers deltas, lints each COMPLETE sentence before emitting it, holds
 * violating sentences back (per-sentence decisions are final). Composes
 * AFTER the existing StreamSanitizer (which owns the fence-marker law).
 * Uses the per-sentence law (lintSentence) — the turn-level fail-open does
 * not apply mid-stream (an all-held stream completes empty, the same
 * posture as the fence-marker sanitizer's all-echoed edge).
 */
export class MarkConformanceStreamSanitizer {
  private buffer = "";
  private readonly facts: ReturnType<typeof factsOfContext>;
  private readonly passThroughRefs: string[] = [];

  constructor(ctx: MarkContext) {
    this.facts = factsOfContext(ctx);
  }

  /** Lint one complete sentence; return the text to emit (or ""). */
  private emitSentence(sentence: string): string {
    const drop = lintSentence(sentence, this.facts, this.passThroughRefs);
    return drop == null ? sentence : "";
  }

  push(delta: string): string {
    this.buffer += delta ?? "";
    let emit = "";
    // emit every complete sentence (terminal punctuation present)
    for (;;) {
      const m = /^(.*?[.!?])(?:\s|$)/s.exec(this.buffer);
      if (m == null) break;
      const sentence = m[1]!.trim();
      this.buffer = this.buffer.slice(m[0].length);
      if (sentence.length === 0) continue;
      const piece = this.emitSentence(sentence);
      if (piece.length > 0) emit += (emit.length > 0 ? " " : "") + piece;
    }
    return emit.length > 0 ? emit + " " : "";
  }

  /** The held-back remainder goes through the exact per-sentence law. */
  flush(): string {
    const tail = this.buffer.trim();
    this.buffer = "";
    if (tail.length === 0) return "";
    return this.emitSentence(tail);
  }
}
