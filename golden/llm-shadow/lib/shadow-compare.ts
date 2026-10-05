// Recorded-shadow comparator — canonicalize -> anchor-resolve -> classify -> aggregate
// (doctrine §5). Pure, deterministic, model-free: CI-safe by construction (doctrine §6, rule 1).
import {
  ENVELOPE_FIELDS,
  PROSE_CLASSES,
  T2_MAX_EXPANSION_RATIO,
  T2_THRESHOLDS,
  TRANSCRIPTION_CLASSES,
  TRANSCRIPTION_COUNT_CLASS,
  TRANSCRIPT_SPEAKERS,
} from "./seam-config.ts";
import type {
  CompareResult,
  FeedbackProseArtifact,
  SegmentResult,
  ShadowFixture,
  TranscriptArtifact,
} from "./types.ts";

// ------------------------------------------------------------- canonicalization

/** NFKC + unified line endings + collapsed whitespace (numeric extraction happens BEFORE collapse). */
export const canonicalizeProse = (s: string): string =>
  s
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

const WORD_RE = /[^\W_]+(?:'[^\W_]+)?/gu;
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "as",
  "by", "at", "from", "into", "about", "can", "will", "would", "which", "who",
  "your", "you", "we", "our", "their", "there", "here", "not", "no", "did",
  "do", "does", "has", "have", "had", "than", "then", "so", "such", "both",
]);

export const tokenize = (s: string): string[] => s.toLowerCase().match(WORD_RE) ?? [];
export const contentTokens = (s: string): string[] =>
  tokenize(s).filter((t) => !STOPWORDS.has(t));

/** Numeric tokens extracted pre-collapse; separators normalized (doctrine §4: formatting ≠ value). */
export const numericTokens = (s: string): string[] =>
  (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

const setDiff = (a: string[], b: string[]) => {
  const sb = new Set(b);
  return a.filter((x) => !sb.has(x));
};

// ------------------------------------------------------------ citation plumbing

export interface AnchorResolution {
  anchor: string;
  resolved: boolean;
}

/**
 * §4.1 — each grounding anchor must RESOLVE in the candidate: content-token
 * containment after canonicalization (the same chunk recognizable however
 * reworded). Deterministic; CI never runs a model to check anchors.
 */
export const resolveAnchors = (anchors: string[], candidateText: string): AnchorResolution[] => {
  const c = new Set(contentTokens(candidateText));
  return anchors.map((anchor) => ({
    anchor,
    resolved: contentTokens(anchor).every((t) => c.has(t)),
  }));
};

// ------------------------------------------------------------------ similarity

/** T2 = asymmetric coverage of baseline content tokens + expansion bound (§4.2). */
export const similarity = (
  baseline: string,
  candidate: string,
): { coverage: number; expansion: number } => {
  const b = contentTokens(baseline);
  const c = new Set(contentTokens(candidate));
  const hit = b.filter((t) => c.has(t)).length;
  return {
    coverage: b.length === 0 ? 1 : hit / b.length,
    expansion: baseline.length === 0 ? 1 : candidate.length / baseline.length,
  };
};

// -------------------------------------------------------------- envelope law T1

/** Exact key-set envelope check (§3 zod row) — extra/renamed field = breach; undefined = missing. */
export const envelopeShapeViolations = (artifact: FeedbackProseArtifact): string[] => {
  const v: string[] = [];
  const expected = ENVELOPE_FIELDS[artifact.view];
  if (!expected) return [`unknown view "${artifact.view}"`];
  const actual = Object.keys(artifact).filter((k) => k !== "text" && k !== "view");
  // the harness artifact carries `text` in place of the view's prose field name;
  // the FIELD-NAME law applies to what the envelope exposes — checked via proseFieldOf.
  for (const k of actual) if (!expected.includes(k)) v.push(`envelope field "${k}" is not part of ${artifact.view}`);
  for (const k of expected) {
    if (k === proseFieldOf(artifact.view)) continue;
    if (!actual.includes(k) || (artifact as unknown as Record<string, unknown>)[k] === undefined)
      v.push(`envelope field "${k}" missing from ${artifact.view}`);
  }
  return v;
};

/** The prose payload's envelope field name per view (explanation | plan). */
export const proseFieldOf = (view: FeedbackProseArtifact["view"]): string =>
  view === "feedback-explanation" ? "explanation" : "plan";

// ------------------------------------------------------------- prose seam gate

/** Compare a recorded smart-mark-prose fixture against a candidate artifact (doctrine §4-§5). */
export const compareFeedbackProse = (
  baseline: ShadowFixture,
  candidate: FeedbackProseArtifact,
): CompareResult => {
  const hardFails: string[] = [];
  const segments: SegmentResult[] = [];
  const base = baseline.artifact as FeedbackProseArtifact;
  const seg = (
    id: string, field: string, cls: SegmentResult["declaredClass"], ok: boolean, detail: string, score?: number,
  ) => segments.push({ segmentId: id, field, declaredClass: cls, ok, detail, ...(score !== undefined ? { score } : {}) });

  // T1: envelope shape (exact key set, verbatim field names).
  const envViol = envelopeShapeViolations(candidate);
  seg("envelope", "envelope", PROSE_CLASSES.envelope, envViol.length === 0,
    envViol.length === 0 ? `${candidate.view} envelope verbatim` : envViol.join("; "));
  for (const v of envViol) hardFails.push(`T1: ${v}`);

  // T0 fields.
  if (candidate.view !== base.view) seg("view", "view", PROSE_CLASSES.view, false, `view ${base.view} -> ${candidate.view} (T0)`);
  if (candidate.partId !== base.partId) seg("partId", "partId", PROSE_CLASSES.partId, false, `partId ${base.partId} -> ${candidate.partId} (T0)`);
  if (candidate.modelId !== base.modelId) seg("modelId", "modelId", PROSE_CLASSES.modelId, false, `modelId ${base.modelId} -> ${candidate.modelId} (T0) — re-derive via reviewed fixture rotation, never a silent pass`);

  // Tolerated wall-clock fields (runner `tolerate` law): generatedAt never compared.

  // T3: numeric/factual drift.
  const baseNums = numericTokens(base.text);
  const candNums = numericTokens(candidate.text);
  for (const n of setDiff(baseNums, candNums)) hardFails.push(`T3: numeric token dropped: "${n}"`);
  for (const n of setDiff(candNums, baseNums)) hardFails.push(`T3: numeric token invented: "${n}"`);

  // T3: citation plumbing — every grounding anchor must resolve.
  for (const r of resolveAnchors(baseline.anchors, candidate.text))
    if (!r.resolved) hardFails.push(`T3: grounding anchor unresolvable: "${r.anchor}"`);

  // T3: leak vectors — scheme rubric lines must never surface (pointLabel law :897-904).
  const candNorm = canonicalizeProse(candidate.text).toLowerCase();
  for (const f of baseline.forbidden)
    if (candNorm.includes(canonicalizeProse(f).toLowerCase()))
      hardFails.push(`T3: leak vector fired (scheme text in prose): "${f.slice(0, 60)}..."`);

  // T2: bounded divergence on the prose payload.
  const { coverage, expansion } = similarity(base.text, candidate.text);
  const threshold = T2_THRESHOLDS["smart-mark-prose"];
  const proseOk =
    hardFails.length === 0 && coverage >= threshold && expansion <= T2_MAX_EXPANSION_RATIO;
  seg("text", proseFieldOf(candidate.view), PROSE_CLASSES.text, proseOk,
    proseOk
      ? `within T2 (coverage=${coverage.toFixed(3)}, expansion=${expansion.toFixed(2)})`
      : hardFails.length > 0
        ? "blocked by T3/T1 hard fails"
        : `beyond T2 (coverage=${coverage.toFixed(3)} < ${threshold} or expansion ${expansion.toFixed(2)} > ${T2_MAX_EXPANSION_RATIO})`,
    coverage);

  const verdict = hardFails.length > 0 || segments.some((s) => !s.ok) ? "FAIL" : "PASS";
  return { verdict, segments, hardFails };
};

// -------------------------------------------------------- transcription seam gate

/** Transcript invariants (stub contract, doctrine §8.2): total gapless order, known speakers, sane timing. */
export const assertTranscriptIntegrity = (artifact: TranscriptArtifact): string[] => {
  const v: string[] = [];
  artifact.segments.forEach((s, i) => {
    if (s.index !== i) v.push(`segment ${i}: index out of order (got ${s.index})`);
    if (s.endMs < s.startMs) v.push(`segment ${i}: endMs < startMs`);
    if (i > 0 && s.startMs !== artifact.segments[i - 1]!.endMs)
      v.push(`segment ${i}: gap/overlap (${artifact.segments[i - 1]!.endMs} -> ${s.startMs})`);
    if (!(TRANSCRIPT_SPEAKERS as readonly string[]).includes(s.speaker))
      v.push(`segment ${i}: unknown speaker "${s.speaker}"`);
  });
  return v;
};

/** Compare a recorded transcription fixture against a candidate artifact (stub — §8.2). */
export const compareTranscription = (
  baseline: ShadowFixture,
  candidate: TranscriptArtifact,
): CompareResult => {
  const hardFails: string[] = [];
  const segments: SegmentResult[] = [];
  const base = baseline.artifact as TranscriptArtifact;

  for (const v of assertTranscriptIntegrity(candidate)) hardFails.push(`invariant: ${v}`);

  const countOk = base.segments.length === candidate.segments.length;
  segments.push({
    segmentId: "segments", field: "segments.length", declaredClass: TRANSCRIPTION_COUNT_CLASS,
    ok: countOk,
    detail: countOk ? `${base.segments.length} segments` : `segment count mismatch: ${base.segments.length} -> ${candidate.segments.length} (T1)`,
  });

  const candAll = candidate.segments.map((s) => s.text).join(" ");
  for (const r of resolveAnchors(baseline.anchors, candAll))
    if (!r.resolved) hardFails.push(`T3: grounding anchor unresolvable: "${r.anchor}"`);

  if (countOk) {
    base.segments.forEach((bs, i) => {
      const cs = candidate.segments[i]!;
      for (const f of ["index", "startMs", "endMs", "speaker"] as const) {
        if (bs[f] !== cs[f])
          segments.push({
            segmentId: `seg${i}`, field: f, declaredClass: TRANSCRIPTION_CLASSES[f],
            ok: false, detail: `${f}: ${String(bs[f])} -> ${String(cs[f])} (T0)`,
          });
      }
      const bn = numericTokens(bs.text);
      const cn = numericTokens(cs.text);
      for (const n of setDiff(bn, cn)) hardFails.push(`T3: numeric token dropped (seg${i}): "${n}"`);
      for (const n of setDiff(cn, bn)) hardFails.push(`T3: numeric token invented (seg${i}): "${n}"`);
      const { coverage, expansion } = similarity(bs.text, cs.text);
      const segT3 = hardFails.filter((h) => h.includes(`(seg${i})`)).length > 0;
      const ok = !segT3 && coverage >= T2_THRESHOLDS.transcription && expansion <= T2_MAX_EXPANSION_RATIO;
      segments.push({
        segmentId: `seg${i}`, field: "text", declaredClass: TRANSCRIPTION_CLASSES.text,
        ok, score: coverage,
        detail: ok ? `within T2 (coverage=${coverage.toFixed(3)})` : "beyond T2 or T3 numeric drift",
      });
    });
  }

  const verdict = hardFails.length > 0 || segments.some((s) => !s.ok) ? "FAIL" : "PASS";
  return { verdict, segments, hardFails };
};

// ------------------------------------------------------------------- aggregate

/** Worst-class-wins aggregate (doctrine §5); hard fails dominate. */
export const aggregate = (results: CompareResult[]): CompareResult => ({
  verdict: results.some((r) => r.verdict === "FAIL") ? "FAIL" : "PASS",
  segments: results.flatMap((r) => r.segments),
  hardFails: results.flatMap((r) => r.hardFails),
});

/** Fixture guard: schema + seam + tolerated-field sanity (doctrine §7 anatomy). */
export const assertFixtureCompatible = (
  fixture: ShadowFixture,
  seam: ShadowFixture["seam"],
): string[] => {
  const v: string[] = [];
  if (fixture.schema !== "llm-shadow/v1") v.push(`unknown fixture schema "${fixture.schema}"`);
  if (fixture.seam !== seam) v.push(`fixture seam "${fixture.seam}" != expected "${seam}"`);
  return v;
};
