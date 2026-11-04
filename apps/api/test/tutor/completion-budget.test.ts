/**
 * T-TUTOR-FIX-1 — the tutor completion-budget pins (issue #706).
 *
 * The walkthrough-class death: the frozen 900 completion budget was
 * calibrated for the retired NON-reasoning groq default; the chain of
 * record serves openai/gpt-oss-120b, whose reasoning tokens count against
 * the cap — a complex pinned ask can exhaust the budget inside the
 * reasoning channel, stream ZERO content deltas, and die on the L2
 * empty-generation law as the fixed wire error (3/3 live reproductions on
 * prod, T-TUTOR-EXP-2 run-001 battery scenario 9).
 *
 * Pinned here (the budget law, nothing else):
 *   - TUTOR_COMPLETION_BUDGET_DEFAULT === 4000 (the calibrated default —
 *     reasoning phase + the longest shaped answer, truncation-disclosed);
 *   - buildGroundedTutorGenerator forwards the budget on BOTH seams
 *     (generate + streamGenerate) and an explicit GeneratorOptions override
 *     wins (the env knob's contract);
 *   - tutorMaxTokensFromEnv — the composition-root projection of the frozen
 *     syllabai.tutor.max-tokens binding: absent/blank/invalid/≤0 resolve to
 *     the default, positive integers ride (the record-compactor semantics).
 *
 * The provider is a RECORDING FAKE (the behavioural-gate doctrine: tests
 * never construct real adapters, zero model calls in CI).
 */
import { describe, expect, test } from "bun:test";
import {
  assembleTutorContext,
  buildGroundedTutorGenerator,
  TUTOR_COMPLETION_BUDGET_DEFAULT,
  type TutorContext,
} from "../../src/services/tutor";
import type { LlmProvider } from "../../src/services/tutor/karag";
import { tutorMaxTokensFromEnv } from "../../src/routes/tutor";

// ── recording fake: captures the wire maxTokens on each seam ────────────────

function recordingLlm(seen: { generate: number[]; stream: number[] }): LlmProvider {
  return {
    available: () => true,
    generate: async (req) => {
      seen.generate.push(req.maxTokens);
      return { text: "The answer is [1].", model: "fake-model", providerName: "fake-provider" };
    },
    stream: async function* (req) {
      seen.stream.push(req.maxTokens);
      yield { text: "The answer", model: "fake-model", providerName: "fake-provider" };
      yield { text: " is [1].", model: "fake-model", providerName: "fake-provider" };
    },
  };
}

/** The real assembled context (the tutor-core.test.ts fixture shape) — the
 *  generator's prompt assembly reads the briefs/evidence off it. */
const minimalContext: TutorContext = assembleTutorContext({
  knowledge: { topics: [], prerequisites: [], misconceptions: [] },
  evidence: [],
  learnerId: null,
  states: [],
  readings: [],
  engagements: [],
  pendingReviews: [],
  activePaperLabel: null,
  quizScaffold: null,
  disclosureTier: 1,
  markContext: null,
  now: new Date("2026-11-04T00:00:00Z"),
});

const QUERY = "Walk me through question 6 of this paper part by part.";

// ── the budget law ──────────────────────────────────────────────────────────

describe("T-TUTOR-FIX-1: the tutor completion budget (issue #706)", () => {
  test("the calibrated default is 4000 (reasoning-model chain of record)", () => {
    expect(TUTOR_COMPLETION_BUDGET_DEFAULT).toBe(4000);
  });

  test("the default budget rides BOTH generation seams", async () => {
    const seen = { generate: [] as number[], stream: [] as number[] };
    const generator = buildGroundedTutorGenerator(recordingLlm(seen));
    await generator.generate(QUERY, [], minimalContext);
    for await (const _ of generator.streamGenerate(QUERY, [], minimalContext)) {
      /* consume — the recording happens at request build */
    }
    expect(seen.generate).toEqual([4000]);
    expect(seen.stream).toEqual([4000]);
  });

  test("an explicit GeneratorOptions.maxTokens override wins (the env knob's contract)", async () => {
    const seen = { generate: [] as number[], stream: [] as number[] };
    const generator = buildGroundedTutorGenerator(recordingLlm(seen), { maxTokens: 900 });
    await generator.generate(QUERY, [], minimalContext);
    expect(seen.generate).toEqual([900]);
  });
});

// ── the composition-root env projection (syllabai.tutor.max-tokens) ─────────

describe("T-TUTOR-FIX-1: tutorMaxTokensFromEnv — the frozen knob, wired", () => {
  test("absent env → the calibrated default", () => {
    expect(tutorMaxTokensFromEnv({})).toBe(4000);
  });

  test("blank / invalid / ≤0 resolve to the default (record-compactor semantics)", () => {
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: "" })).toBe(4000);
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: "   " })).toBe(4000);
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: "abc" })).toBe(4000);
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: "0" })).toBe(4000);
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: "-5" })).toBe(4000);
  });

  test("a positive integer rides verbatim (truncated)", () => {
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: "2000" })).toBe(2000);
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: " 2500 " })).toBe(2500);
    expect(tutorMaxTokensFromEnv({ SYLLABAI_TUTOR_MAX_TOKENS: "6000.9" })).toBe(6000);
  });
});
