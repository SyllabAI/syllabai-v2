/**
 * The chain-backed BAND candidate generator (ADR-040 §5.4 — the LEVELS
 * analog of chainAsCandidateGenerator):
 *
 *   - the BAND_MARKING_RULES system prompt + the strict-JSON envelopes
 *     (single-part + the v4-style attempt batch), the $0-chain budget
 *     formula over the part's printed marks, the truncation refusal, and
 *     the JSON-body extraction (first '{' … last '}');
 *   - the prompt of record (§2.2): part label + question prompt + the level
 *     descriptors (+ guidance) + learner answer; general_guidance is SENT
 *     from day one (the point path discloses it as unsent — issue #276
 *     §4.8; band descriptors are short enough that the thinness debt is not
 *     re-created for the new kind);
 *   - the deterministic range-correction envelope: the §2.2 hard range law
 *     gives an out-of-range candidate ONE retry with the violations stated
 *     back verbatim — never a silent clamp;
 *   - refusals ride the frozen reason vocabulary (PROVIDER_UNAVAILABLE /
 *     TRUNCATED_OUTPUT / UNPARSEABLE_OUTPUT + the band MALFORMED_PLACEMENT);
 *     parse failures refuse with the raw output attached where it exists
 *     (self-forensic rows), fail-closed either way.
 */
import {
  CandidateGenerationError,
  type BandCorrection,
  type BandMarkingCandidateGenerator,
  type BandMarkingContext,
  type BandPlacementCandidate,
  type DescriptorHit,
} from "../smartmark";
import { appendLearnerAnswer, isTruncationFinish } from "./bridges";
import type { FailoverLlmChain } from "./index";
import type { LlmChainResponse } from "./health";

/** The frozen constants (shared with the point generator's budget law). */
const BASE_COMPLETION_BUDGET = 800;
const COMPLETION_BUDGET_PER_MARK = 400;
const MAX_COMPLETION_BUDGET = 4_000;
const MAX_BATCH_COMPLETION_BUDGET = 8_000;

/** completionBudgetFor — the point generator's formula, band edition: the
 *  budget rides the part's printed marks (the §2.1 tiling law guarantees the
 *  top band reaches them). LEVELS prompts are longer (descriptors are
 *  verbose) — the delta is measured at R8 per band, not assumed. */
export function bandCompletionBudget(partMarks: number, cap: number): number {
  return Math.min(BASE_COMPLETION_BUDGET + COMPLETION_BUDGET_PER_MARK * Math.max(1, partMarks), cap);
}

/**
 * The band marking rules — the LEVELS instrument, stated plainly: place the
 * whole response in exactly one listed level, award within that level's
 * printed range, disclose which descriptors the response met. No
 * pseudo-points, no direct-marks shortcut (ADR-040 §4 rejected list).
 */
const BAND_MARKING_RULES = `You are an exam marker aligned strictly to the provided levels-of-response mark scheme.
Read the learner's whole response to the question part, then mark it the way the printed scheme instructs:
- Choose the ONE level whose descriptor best matches the response.
- Choose the mark WITHIN that level's printed range — never below the
  level's minimum, never above its maximum.
- List which descriptors the response meets, each with a one-sentence
  rationale grounded in the learner's own words.
Place every response in exactly one listed level. Never invent levels,
ranges or descriptors. Never award marks outside the placed level's range.
`;

function bandSystemPrompt(): string {
  return (
    BAND_MARKING_RULES +
    `Respond with ONLY a JSON object:
{"confidence": <0..1>, "levelPlacement": <levelIndex>, "awardedMarks": <marks>,
"descriptorHits": [{"levelIndex": <levelIndex>, "hit": true, "rationale": "..."}]}
<levelIndex> is the level number printed as "level=<n>" in the LEVEL
DESCRIPTORS list. <marks> is an integer inside the placed level's range.
`
  );
}

/** The v4-style batch envelope: one parts array, one object per answered part. */
function bandBatchSystemPrompt(): string {
  return (
    BAND_MARKING_RULES +
    `The learner answered SEVERAL question parts of one question. Place each
part INDEPENDENTLY against the printed levels — an answer to one part never
earns another part's marks.
Respond with ONLY a JSON object:
{"parts": [{"part": <partNumber>, "confidence": <0..1>,
"levelPlacement": <levelIndex>, "awardedMarks": <marks>,
"descriptorHits": [{"levelIndex": <levelIndex>, "hit": true, "rationale": "..."}]}]}
<partNumber> is the 1-based number printed in the PART header.
Return one object for EVERY listed part.
`
  );
}

function appendBandLevels(sb: string, context: BandMarkingContext): string {
  let out = sb + "\nLEVEL DESCRIPTORS:\n";
  for (const band of context.bands) {
    out += `- level=${band.levelIndex} marks=${band.marksMin}..${band.marksMax}\n`;
    out += `  descriptor: ${band.descriptorMd}\n`;
    if (band.guidanceMd !== null && band.guidanceMd.trim() !== "") {
      out += `  guidance: ${band.guidanceMd}\n`;
    }
  }
  return out;
}

/** bandUserPrompt — the §2.2 prompt of record: part label + question prompt +
 * the level descriptors (+ guidance) + learner answer; general_guidance is
 * SENT from day one. `correction` carries the hard-range retry's violations
 * verbatim (the ONE deterministic retry — never a fresh angle, never a
 * clamp). */
export function bandUserPrompt(context: BandMarkingContext, correction?: BandCorrection): string {
  let sb = `QUESTION PART (${context.answer.label}):\n`;
  if (context.partPrompt !== null && context.partPrompt.trim() !== "") {
    sb += `${context.partPrompt}\n`;
  }
  sb = appendBandLevels(sb, context);
  if (context.generalGuidance !== null && context.generalGuidance.trim() !== "") {
    sb += "\nGENERAL GUIDANCE (notes for awarders):\n";
    sb += `${context.generalGuidance}\n`;
  }
  sb = appendLearnerAnswer(sb, context.answer.answerText);
  if (correction !== undefined && correction.violations.length > 0) {
    sb += "\nRANGE CORRECTION (your previous placement was rejected):\n";
    for (const violation of correction.violations) {
      sb += `- ${violation}\n`;
    }
    sb += "Return a corrected placement: the mark MUST sit inside the placed level's printed range.\n";
  }
  return sb;
}

/** bandBatchUserPrompt — the numbered PART headers (the v4 shape). */
export function bandBatchUserPrompt(contexts: BandMarkingContext[]): string {
  let sb =
    `STRUCTURED ATTEMPT: ${contexts.length}` +
    ` answered parts of one question, each placed against the printed\n` +
    `levels. Mark every part below.\n`;
  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i]!;
    sb += `\n===== PART ${i + 1} of ${contexts.length}` +
      ` (label: ${context.answer.label}) =====\n`;
    sb += `QUESTION PART (${context.answer.label}):\n`;
    if (context.partPrompt !== null && context.partPrompt.trim() !== "") {
      sb += `${context.partPrompt}\n`;
    }
    sb = appendBandLevels(sb, context);
    if (context.generalGuidance !== null && context.generalGuidance.trim() !== "") {
      sb += "\nGENERAL GUIDANCE (notes for awarders):\n";
      sb += `${context.generalGuidance}\n`;
    }
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

function nodeDouble(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * parseBandPlacement — the band candidate parse. The placement and the
 * awarded marks must be INTEGERS (an ordinal level, an integer mark — a
 * fractional or missing value is a malformed payload, refused with the raw
 * output attached, never guessed, never truncated). Descriptor hits are
 * transparency, not gate: each entry must still be well-formed (an object
 * with an integer levelIndex) or the whole candidate refuses — the pipeline's
 * validators then hold the in-scope and hard-range laws.
 */
export function parseBandPlacement(
  root: Record<string, unknown>,
  raw: string,
): { levelPlacement: number; awardedMarks: number; descriptorHits: DescriptorHit[]; confidence: number | null } {
  const placement = root.levelPlacement;
  if (typeof placement !== "number" || !Number.isInteger(placement) || placement < 1) {
    throw new CandidateGenerationError("MALFORMED_PLACEMENT", raw);
  }
  const awarded = root.awardedMarks;
  if (typeof awarded !== "number" || !Number.isFinite(awarded) || !Number.isInteger(awarded)) {
    throw new CandidateGenerationError("MALFORMED_PLACEMENT", raw);
  }
  const hitsNode = root.descriptorHits === undefined || root.descriptorHits === null ? [] : root.descriptorHits;
  if (!Array.isArray(hitsNode)) {
    throw new CandidateGenerationError("MALFORMED_PLACEMENT", raw);
  }
  const descriptorHits: DescriptorHit[] = hitsNode.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new CandidateGenerationError("MALFORMED_PLACEMENT", raw);
    }
    const record = entry as Record<string, unknown>;
    const levelIndex = record.levelIndex;
    if (typeof levelIndex !== "number" || !Number.isInteger(levelIndex) || levelIndex < 1) {
      throw new CandidateGenerationError("MALFORMED_PLACEMENT", raw);
    }
    return {
      levelIndex,
      hit: record.hit === true,
      rationale: typeof record.rationale === "string" ? record.rationale : "",
    };
  });
  return {
    levelPlacement: placement,
    awardedMarks: awarded,
    descriptorHits,
    confidence: nodeDouble(root.confidence),
  };
}

/**
 * The chain-backed band generator. Chain exhaustion maps to the
 * PROVIDER_UNAVAILABLE refusal (the pipeline's fail-closed path); every
 * parse failure refuses with the frozen reason vocabulary and the raw
 * output attached where it exists (self-forensic rows).
 */
export function chainAsBandCandidateGenerator(chain: FailoverLlmChain): BandMarkingCandidateGenerator {
  const request = (system: string, user: string, maxTokens: number) => ({
    system,
    user,
    temperature: 0.1,
    maxTokens,
    // band placement is rubric-shaped extraction, not open-ended reasoning —
    // LOW keeps the thinking budget (and wall clock) bounded, same as points
    reasoningEffort: "low" as const,
  });

  const toCandidate = (response: LlmChainResponse, root: Record<string, unknown>): BandPlacementCandidate => {
    const parsed = parseBandPlacement(root, response.text);
    return {
      modelId: response.model,
      ...parsed,
      rawOutput: response.text,
    };
  };

  return {
    async proposeBand(context: BandMarkingContext, correction?: BandCorrection): Promise<BandPlacementCandidate> {
      if (!chain.available()) {
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      let response: LlmChainResponse;
      try {
        response = await chain.generate(
          request(
            bandSystemPrompt(),
            bandUserPrompt(context, correction),
            bandCompletionBudget(context.answer.partMarks, MAX_COMPLETION_BUDGET),
          ),
        );
      } catch (e) {
        if (e instanceof CandidateGenerationError) throw e;
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      if (isTruncationFinish(response.finishReason)) {
        // the completion hit the token cap mid-flight: whatever text arrived
        // is an incomplete payload, not a candidate — refuse with the raw
        // text attached so the row is self-forensic (never silently re-marked)
        throw new CandidateGenerationError("TRUNCATED_OUTPUT", response.text);
      }
      return toCandidate(response, readRoot(response.text));
    },

    async proposeBandsAll(contexts: BandMarkingContext[]): Promise<BandPlacementCandidate[]> {
      if (!chain.available()) {
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      let response: LlmChainResponse;
      const budget = contexts.reduce((total, context) => total + Math.max(1, context.answer.partMarks), 0);
      try {
        response = await chain.generate(
          request(bandBatchSystemPrompt(), bandBatchUserPrompt(contexts), bandCompletionBudget(budget, MAX_BATCH_COMPLETION_BUDGET)),
        );
      } catch (e) {
        if (e instanceof CandidateGenerationError) throw e;
        throw new CandidateGenerationError("PROVIDER_UNAVAILABLE");
      }
      if (isTruncationFinish(response.finishReason)) {
        // same self-forensic contract as the single-part path
        throw new CandidateGenerationError("TRUNCATED_OUTPUT", response.text);
      }
      // batch parse: exactly one uniquely-numbered object per context —
      // anything else refuses the WHOLE batch (the pipeline falls back to
      // the per-part topology)
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
        if (part === null || typeof part !== "object" || Array.isArray(part)) {
          throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
        }
        const record = part as Record<string, unknown>;
        const number = record.part;
        if (typeof number !== "number" || !Number.isInteger(number) || byNumber.has(number)) {
          throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
        }
        byNumber.set(number, record);
      }
      const parsed: BandPlacementCandidate[] = new Array(contexts.length);
      for (let i = 0; i < contexts.length; i++) {
        const part = byNumber.get(i + 1);
        if (part === undefined) {
          throw new CandidateGenerationError("UNPARSEABLE_OUTPUT", response.text);
        }
        parsed[i] = {
          modelId: response.model,
          ...parseBandPlacement(part, response.text),
          rawOutput: response.text,
        };
      }
      return parsed;
    },
  };
}
