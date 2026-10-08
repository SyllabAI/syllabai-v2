/**
 * The chain→port bridges — how the ONE LlmProvider port (tutor/CLA), the
 * smartmark marking seams (MarkingCandidateGenerator/FeedbackLlm) and the
 * transcription seam (TranscriptionProvider) consume the §26.1 chain.
 *
 * The candidate generator is a line-against-line port of
 * smartmark/LlmMarkingCandidateGenerator.java @ 6cad6ef (prompt v3 + the v4
 * attempt-batch envelope): the MARKING_RULES, the strict-JSON envelopes, the
 * completion-budget formula (800 + 400/mark, caps 4k/8k), the truncation
 * refusal (finish_reason length/max_tokens → TRUNCATED_OUTPUT with the raw
 * text attached), the JSON-body extraction (first '{' … last '}'), the UUID
 * mark-point validation, the v3 clamp-don't-reject over-award law and the v2
 * boolean-`awarded` backward compatibility, and the batch parse law (exact
 * count, unique numeric part numbers — a mismatch refuses the WHOLE batch so
 * the pipeline's fallback ladder re-marks per part).
 *
 * DISCLOSED SHAPE ADAPTATIONS (driven by the v2 MarkingContext — the ported
 * pipeline carries no part prompt text, no scheme general-guidance and no
 * per-point acceptance criteria):
 *   - the user prompt renders the part LABEL (the v2 MarkingAnswerRef.label),
 *     its scheme points (id/ref/marks/required text) and the learner answer;
 *     the QUESTION PART prompt section and the SCHEME-LEVEL GENERAL
 *     INSTRUCTIONS / acceptance sections are omitted (no data), so the
 *     appendGeneralGuidance/appendSchemePoints acceptance lines have no v2
 *     counterpart;
 *   - reasoningEffort LOW rides the request (§26 knob); the OpenAI-compatible
 *     members wire reasoning_effort, the gemini REST member ignores it (the
 *     SDK thinkingLevel enum has no direct REST equivalent — disclosed).
 * Everything the model returns is still a CANDIDATE: unknown point ids,
 * missing decisions and impossible sums are caught downstream by the
 * deterministic validators — this adapter trusts nothing it cannot parse.
 */
import type { FailoverLlmChain } from "./index";
import type { LlmChainResponse } from "./health";
import type { LlmProvider } from "../tutor/karag";
import type {
  Allocation,
  FeedbackLlm,
  MarkingCandidate,
  MarkingCandidateGenerator,
  MarkingContext,
  MarkingPoint,
} from "../smartmark";
import { CandidateGenerationError } from "../smartmark";
import type { TranscriptionProvider, TranscriptionProviderResponse } from "../answer-input/service";

// ── tutor / CLA (LlmProvider over the chain) ────────────────────────────────

/**
 * The frozen core consumes the chain DIRECTLY as the LlmProvider port
 * (FailoverLlmChain implements LlmProvider); the v2 port splits the shapes,
 * so this bridge re-unites them — generate/stream ride the chain's
 * failover + media routing + health bookkeeping untouched.
 */
export function chainAsLlmProvider(chain: FailoverLlmChain): LlmProvider {
  return {
    available: () => chain.available(),
    generate: async (req: { system: string; user: string; temperature: number; maxTokens: number }) => {
      const out = await chain.generate(req);
      return { text: out.text, model: out.model, providerName: out.providerName };
    },
    stream: (req: { system: string; user: string; temperature: number; maxTokens: number }) =>
      chain.stream(req),
  };
}

// ── smartmark feedback prose (FeedbackLlm over the chain) ───────────────────

export function chainAsFeedbackLlm(chain: FailoverLlmChain): FeedbackLlm {
  return {
    available: () => chain.available(),
    generate: async (systemPrompt: string, userPrompt: string, temperature: number) => {
      const out = await chain.generate({ system: systemPrompt, user: userPrompt, temperature });
      return out.text;
    },
  };
}

// ── transcription (TranscriptionProvider over the vision-capable member) ────

export function chainAsTranscriptionProvider(chain: FailoverLlmChain): TranscriptionProvider {
  return {
    generate: async (req): Promise<TranscriptionProviderResponse> => {
      const started = Date.now();
      // the chain routes the media ONLY to supportsMedia() members (frozen
      // law) — with no vision-capable member available the call throws the
      // distinct exhaustion message and the service maps ANY throw to the
      // honest 503 transcription_unavailable
      const out = await chain.generate({
        system: req.systemPrompt,
        user: req.userPrompt,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        media: { base64: req.media.base64, mimeType: req.media.mimeType },
      });
      return {
        text: out.text,
        providerName: out.providerName,
        model: out.model,
        latencyMs: Date.now() - started,
      };
    },
  };
}

// ── smart-mark candidate generation (LlmMarkingCandidateGenerator port) ─────

/** The frozen constants (G-4 round, UNPARSEABLE_OUTPUT_INVESTIGATION). */
const BASE_COMPLETION_BUDGET = 800;
const COMPLETION_BUDGET_PER_MARK = 400;
const MAX_COMPLETION_BUDGET = 4_000;
const MAX_BATCH_COMPLETION_BUDGET = 8_000;

/** LlmMarkingCandidateGenerator.isTruncationFinish (normalized lower-case). */
export function isTruncationFinish(finishReason: string | null | undefined): boolean {
  if (finishReason == null) return false;
  const normalized = finishReason.trim().toLowerCase();
  return normalized === "length" || normalized === "max_tokens";
}

function sumMarks(points: MarkingPoint[]): number {
  return points.reduce((total, point) => total + Math.max(1, point.marks), 0);
}

function completionBudgetFor(totalMarks: number, cap: number): number {
  return Math.min(BASE_COMPLETION_BUDGET + COMPLETION_BUDGET_PER_MARK * totalMarks, cap);
}

/** completionBudget(List<MarkPoint>) — one marking call. */
export function completionBudget(points: MarkingPoint[]): number {
  return completionBudgetFor(sumMarks(points), MAX_COMPLETION_BUDGET);
}

/** batchCompletionBudget(List<MarkingContext>) — the whole attempt shares one. */
export function batchCompletionBudget(contexts: MarkingContext[]): number {
  return completionBudgetFor(
    contexts.reduce((total, context) => total + sumMarks(context.points), 0),
    MAX_BATCH_COMPLETION_BUDGET,
  );
}

/**
 * The marking rules — byte-identical to the frozen MARKING_RULES text block
 * (v3 per-point partial marks; the escaped-quote line mirrors the Java text
 * block's \" escape exactly).
 */
const MARKING_RULES = `You are an exam marker aligned strictly to the provided mark scheme.
For every MARK POINT decide how many of its marks the learner earns:
- A point worth N marks may bundle several sub-points, each annotated
  like "[1 mark]" or listed as separate bullets. Assess every
  sub-point INDEPENDENTLY and return the sum the learner earned
  (0 up to N).
- Award a sub-point when the learner's answer contains its required
  content (spelling variants allowed when the scheme says so).
  Missing one sub-point never blocks another, unless the scheme
  states a dependency (e.g. "dep on M1").
- "evidence": the shortest verbatim quote from the learner answer
  that justifies the marks earned ("" when none earned).
- "rationale": one or two short sentences; for a multi-mark point,
  name which sub-points were earned and which were missed.
`;

function systemPrompt(): string {
  return (
    MARKING_RULES +
    `Respond with ONLY a JSON object:
{"confidence": <0..1>, "allocations": [{"markPointId": "<id>",
"ref": "<ref>", "marksAwarded": <0..N>, "evidence": "...",
"rationale": "..."}]}
Decide EVERY listed mark point. Never invent mark point ids. Never
award more marks than a point is worth.
`
  );
}

/** v4 batch envelope: one parts array, one object per answered part. */
function batchSystemPrompt(): string {
  return (
    MARKING_RULES +
    `The learner answered SEVERAL question parts of one question. Mark
each part INDEPENDENTLY against its own listed mark points — an
answer to one part never earns another part's marks.
Respond with ONLY a JSON object:
{"parts": [{"part": <partNumber>, "confidence": <0..1>,
"allocations": [{"markPointId": "<id>", "ref": "<ref>",
"marksAwarded": <0..N>, "evidence": "...", "rationale": "..."}]}]}
<partNumber> is the 1-based number printed in the PART header.
Return one object for EVERY listed part. Decide EVERY listed mark
point of every part. Never invent mark point ids. Never award more
marks than a point is worth.
`
  );
}

/** appendLearnerAnswer — the answer-format-v2 reading law, verbatim. */
function appendLearnerAnswer(sb: string, answerText: string | null): string {
  return (
    sb +
    `\nLEARNER ANSWER (answer format v2 — Markdown text that may embed\n` +
    `inline LaTeX math in $…$ / $$…$$ and <sub>/<sup>/<br/> inline HTML;\n` +
    `read the math and markup literally as the learner's working, never as\n` +
    `decorative prose; older answers are plain text):\n` +
    (answerText ?? "")
  );
}

function appendSchemePoints(sb: string, points: MarkingPoint[]): string {
  let out = sb;
  for (const point of points) {
    out +=
      `- id=${point.id}` +
      ` ref=${point.ref == null ? "?" : point.ref}` +
      ` marks=${point.marks}` +
      `\n  required: ${point.text}\n`;
  }
  return out;
}

/** userPrompt(MarkingContext) — the v2 shape (disclosed: label, no prompt/guidance sections). */
function userPrompt(context: MarkingContext): string {
  let sb = `QUESTION PART (${context.answer.label}):\n`;
  sb += "\nMARK SCHEME POINTS:\n";
  sb = appendSchemePoints(sb, context.points);
  sb = appendLearnerAnswer(sb, context.answer.answerText);
  return sb;
}

/** batchUserPrompt(List<MarkingContext>) — the v4 numbered PART headers. */
function batchUserPrompt(contexts: MarkingContext[]): string {
  let sb =
    `STRUCTURED ATTEMPT: ${contexts.length}` +
    ` answered parts of one question, each marked against its\n` +
    `own listed mark points. Mark every part below.\n`;
  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i]!;
    sb += `\n===== PART ${i + 1} of ${contexts.length}` +
      ` (label: ${context.answer.label}) =====\n`;
    sb += `QUESTION PART (${context.answer.label}):\n`;
    sb += "\nMARK SCHEME POINTS:\n";
    sb = appendSchemePoints(sb, context.points);
    sb = appendLearnerAnswer(sb, context.answer.answerText);
  }
  return sb;
}

function extractJsonBody(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", raw);
  }
  return raw.slice(start, end + 1);
}

function readRoot(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(extractJsonBody(raw)) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof CandidateGenerationError) throw e;
    throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", raw);
  }
}

/**
 * resolveMarks — the v3 law: marksAwarded (0..N) clamped to the point's
 * worth (an over-award is an arithmetic slip, not a hallucination — clamp,
 * never reject); a model answering the v2 shape (boolean awarded only)
 * still parses, awarding the whole point or nothing.
 */
export function resolveMarks(node: Record<string, unknown>, point: MarkingPoint | undefined): number {
  const pointMarks = point === undefined ? 1 : Math.max(1, point.marks);
  const marks = node.marksAwarded;
  if (typeof marks === "number" && Number.isFinite(marks)) {
    return Math.max(0, Math.min(Math.trunc(marks), pointMarks));
  }
  return node.awarded === true ? pointMarks : 0;
}

function parseAllocations(
  allocations: unknown,
  context: MarkingContext,
  raw: string,
): Allocation[] {
  if (allocations == null || !Array.isArray(allocations)) {
    throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", raw);
  }
  const pointsById = new Map(context.points.map((p) => [p.id, p]));
  const parsed: Allocation[] = [];
  for (const node of allocations) {
    if (node === null || typeof node !== "object") {
      throw new CandidateGenerationError("MALFORMED_ALLOCATION");
    }
    const record = node as Record<string, unknown>;
    const id = typeof record.markPointId === "string" ? record.markPointId : null;
    if (id == null || id.trim() === "") {
      throw new CandidateGenerationError("MALFORMED_ALLOCATION");
    }
    let markPointId: string;
    try {
      markPointId = normalizeUuid(id);
    } catch {
      // a malformed id is a bad CANDIDATE, not a server error
      throw new CandidateGenerationError("MALFORMED_ALLOCATION", raw);
    }
    const evidence = typeof record.evidence === "string" ? record.evidence : "";
    const rationale = typeof record.rationale === "string" ? record.rationale : "";
    const ref = typeof record.ref === "string" ? record.ref : "";
    const marksAwarded = resolveMarks(record, pointsById.get(markPointId));
    parsed.push({
      markPointId,
      ref,
      // the v2 Allocation carries the v3 partial-marks result AND the
      // boolean award flag (marksAwarded > 0) — the breakdown projection
      // reads both (decide() :327-335)
      awarded: marksAwarded > 0,
      marksAwarded,
      evidence,
      rationale,
    });
  }
  return parsed;
}

/**
 * UUID.fromString strictness: the v2 mark-point ids are stored UUIDs, so the
 * model echoing them can only lowercase/uppercase-drift — accept the canonical
 * dashed 8-4-4-4-12 hex form (case-insensitive, normalized lower); anything
 * else refuses the candidate (never an HTTP 400).
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function normalizeUuid(id: string): string {
  if (!UUID_RE.test(id)) throw new Error("not a uuid");
  return id.toLowerCase();
}

function nodeDouble(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The chain-backed generator (LlmMarkingCandidateGenerator.java). Chain
 * exhaustion maps to the PROVIDER_UNAVAILABLE refusal (the pipeline's
 * fail-closed path); every parse failure refuses with the frozen reason
 * vocabulary and the raw output attached where it exists (self-forensic rows).
 */
export function chainAsCandidateGenerator(chain: FailoverLlmChain): MarkingCandidateGenerator {
  const request = (system: string, user: string, maxTokens: number) => ({
    system,
    user,
    temperature: 0.1,
    maxTokens,
    // marking is rubric-shaped extraction, not open-ended reasoning — LOW
    // keeps the thinking budget (and wall clock) bounded
    reasoningEffort: "low" as const,
  });

  const toCandidate = (response: LlmChainResponse, context: MarkingContext): MarkingCandidate => {
    if (isTruncationFinish(response.finishReason)) {
      // the completion hit the token cap mid-flight: whatever text arrived is
      // an incomplete payload, not a candidate — refuse with the raw text
      // attached so the row is self-forensic (never silently re-marked)
      throw new CandidateGenerationError("TRUNCATED_OUTPUT", response.text);
    }
    const root = readRoot(response.text);
    return {
      modelId: response.model,
      allocations: parseAllocations(root.allocations, context, response.text),
      confidence: nodeDouble(root.confidence),
      rawOutput: response.text,
    };
  };

  return {
    async propose(context: MarkingContext): Promise<MarkingCandidate> {
      if (!chain.available()) {
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      let response: LlmChainResponse;
      try {
        response = await chain.generate(request(systemPrompt(), userPrompt(context), completionBudget(context.points)));
      } catch (e) {
        if (e instanceof CandidateGenerationError) throw e;
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      return toCandidate(response, context);
    },

    async proposeAll(contexts: MarkingContext[]): Promise<MarkingCandidate[]> {
      if (!chain.available()) {
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      let response: LlmChainResponse;
      try {
        response = await chain.generate(
          request(batchSystemPrompt(), batchUserPrompt(contexts), batchCompletionBudget(contexts)),
        );
      } catch (e) {
        if (e instanceof CandidateGenerationError) throw e;
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      if (isTruncationFinish(response.finishReason)) {
        // same self-forensic contract as the single-part path
        throw new CandidateGenerationError("TRUNCATED_OUTPUT", response.text);
      }
      // v4 batch parse: exactly one uniquely-numbered object per context —
      // anything else refuses the WHOLE batch (the pipeline falls back to
      // the classic per-part topology)
      const root = readRoot(response.text);
      const parts = root.parts;
      if (parts == null || !Array.isArray(parts)) {
        throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
      }
      if (parts.length !== contexts.length) {
        throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
      }
      const byNumber = new Map<number, Record<string, unknown>>();
      for (const part of parts) {
        if (part === null || typeof part !== "object") {
          throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
        }
        const record = part as Record<string, unknown>;
        const number = record.part;
        if (typeof number !== "number" || !Number.isInteger(number) || byNumber.has(number)) {
          throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
        }
        byNumber.set(number, record);
      }
      const parsed: MarkingCandidate[] = new Array(contexts.length);
      for (let i = 0; i < contexts.length; i++) {
        const part = byNumber.get(i + 1);
        if (part === undefined) {
          throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
        }
        parsed[i] = {
          modelId: response.model,
          allocations: parseAllocations(part.allocations, contexts[i]!, response.text),
          confidence: nodeDouble(part.confidence),
          rawOutput: response.text,
        };
      }
      return parsed;
    },
  };
}
