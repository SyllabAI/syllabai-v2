/**
 * ADR-040 §5.4 — the chain-backed BAND candidate generator (llmchain/bands.ts):
 * the §2.2 prompt of record (part label + question prompt + the verbatim level
 * descriptors + guidance + general_guidance + the learner answer; the
 * deterministic range-correction envelope), the strict-JSON parse laws
 * (integer placement + integer within-band marks; malformed → refused with
 * the raw output attached), the budget formula, the truncation refusal, and
 * the v4-style batch envelope over the ONE chain.
 */
import { describe, expect, test } from "bun:test";
import {
  chainAsBandCandidateGenerator,
  bandUserPrompt,
  bandBatchUserPrompt,
  bandCompletionBudget,
  parseBandPlacement,
} from "../../src/services/llmchain";
import { CandidateGenerationError, toMarkingBand, type BandMarkingContext } from "../../src/services/smartmark";
import type { FailoverLlmChain } from "../../src/services/llmchain";

const SCHEME_ID = "70000000-0000-0000-0000-000000000009";

function bandContext(overrides: Partial<BandMarkingContext> = {}): BandMarkingContext {
  return {
    answer: {
      id: "aa000000-0000-4000-8000-000000000001",
      attemptId: "9a000000-0000-4000-8000-000000000001",
      questionPartId: "60000000-0000-0000-0000-000000000001",
      answerText: "The student's written answer.",
      label: "(a)",
      partMarks: 4,
    },
    schemeId: SCHEME_ID,
    schemeValidationState: "VALIDATED",
    bands: [
      { id: "b1", level_index: 1, marks_min: 1, marks_max: 2, descriptor_md: "Answers make basic statements.", guidance_md: null },
      { id: "b2", level_index: 2, marks_min: 3, marks_max: 4, descriptor_md: "Answers use some precise scientific terminology.", guidance_md: "Reward linked statements." },
    ].map(toMarkingBand),
    partPrompt: "Explain why the reaction is exothermic.",
    generalGuidance: "Marks are for linked statements, not lists.",
    ...overrides,
  };
}

function fakeChain(response: { text: string; finishReason?: string | null; model?: string }, opts: { available?: boolean; calls?: Array<Record<string, unknown>> } = {}) {
  const calls = opts.calls ?? [];
  const chain = {
    available: () => opts.available ?? true,
    generate: async (request: Record<string, unknown>) => {
      calls.push(request);
      return {
        text: response.text,
        model: response.model ?? "glm-4.6",
        providerName: "groq",
        finishReason: response.finishReason ?? null,
      };
    },
  };
  return { chain: chain as unknown as FailoverLlmChain, calls };
}

const OK_JSON =
  '{"confidence": 0.9, "levelPlacement": 2, "awardedMarks": 3, "descriptorHits": [{"levelIndex": 2, "hit": true, "rationale": "linked statements"}]}';

describe("band prompts — the §2.2 prompt of record", () => {
  test("user prompt carries label + question prompt + verbatim descriptors + guidance + general guidance + learner answer", () => {
    const prompt = bandUserPrompt(bandContext());
    expect(prompt).toContain("QUESTION PART ((a)):");
    expect(prompt).toContain("Explain why the reaction is exothermic.");
    expect(prompt).toContain("LEVEL DESCRIPTORS:");
    expect(prompt).toContain("- level=1 marks=1..2");
    expect(prompt).toContain("- level=2 marks=3..4");
    expect(prompt).toContain("descriptor: Answers use some precise scientific terminology.");
    expect(prompt).toContain("guidance: Reward linked statements.");
    expect(prompt).toContain("GENERAL GUIDANCE (notes for awarders):");
    expect(prompt).toContain("Marks are for linked statements, not lists.");
    expect(prompt).toContain("LEARNER ANSWER (answer format v2");
    expect(prompt).toContain("The student's written answer.");
    // a band without guidance carries no guidance line
    const noGuidance = bandUserPrompt(bandContext({ bands: bandContext().bands.slice(0, 1) }));
    expect(noGuidance).not.toContain("guidance: ");
  });

  test("absent general guidance → no GENERAL GUIDANCE block (nullable, never an empty lie)", () => {
    const prompt = bandUserPrompt(bandContext({ generalGuidance: null }));
    expect(prompt).not.toContain("GENERAL GUIDANCE");
  });

  test("the range-correction envelope states the violations verbatim (ONE deterministic retry)", () => {
    const prompt = bandUserPrompt(bandContext(), {
      violations: ["band-range: awarded marks 6 fall outside the placed level 2 range 3..4"],
    });
    expect(prompt).toContain("RANGE CORRECTION (your previous placement was rejected):");
    expect(prompt).toContain("- band-range: awarded marks 6 fall outside the placed level 2 range 3..4");
    expect(prompt).toContain("the mark MUST sit inside the placed level's printed range.");
  });

  test("batch prompt: numbered PART headers, one block per part", () => {
    const prompt = bandBatchUserPrompt([bandContext(), bandContext({ answer: { ...bandContext().answer, label: "(b)", partMarks: 6 } })]);
    expect(prompt).toContain("STRUCTURED ATTEMPT: 2 answered parts");
    expect(prompt).toContain("===== PART 1 of 2");
    expect(prompt).toContain("===== PART 2 of 2");
    expect(prompt).toContain("QUESTION PART ((b)):");
  });

  test("budget formula: 800 + 400/mark over the part's printed marks, capped (4k single / 8k batch)", () => {
    expect(bandCompletionBudget(4, 4_000)).toBe(800 + 400 * 4);
    expect(bandCompletionBudget(0, 4_000)).toBe(800 + 400); // the Math.max(1, …) floor
    expect(bandCompletionBudget(100, 4_000)).toBe(4_000);
    expect(bandCompletionBudget(100, 8_000)).toBe(8_000);
  });
});

describe("parseBandPlacement — the strict parse", () => {
  test("happy path: integer placement + integer marks + coerced hits", () => {
    const parsed = parseBandPlacement(JSON.parse(OK_JSON) as Record<string, unknown>, OK_JSON);
    expect(parsed).toEqual({
      levelPlacement: 2,
      awardedMarks: 3,
      descriptorHits: [{ levelIndex: 2, hit: true, rationale: "linked statements" }],
      confidence: 0.9,
    });
  });

  test("missing/non-integer placement or marks → MALFORMED_PLACEMENT (never guessed, never truncated)", () => {
    for (const root of [
      { awardedMarks: 3 },
      { levelPlacement: 2.5, awardedMarks: 3 },
      { levelPlacement: 2, awardedMarks: 3.5 },
      { levelPlacement: 2, awardedMarks: "3" },
      { levelPlacement: 2 },
    ]) {
      expect(() => parseBandPlacement(root as Record<string, unknown>, "raw")).toThrow(CandidateGenerationError);
    }
  });

  test("descriptorHits absent/null → empty array; malformed entry → refusal", () => {
    expect(parseBandPlacement({ levelPlacement: 1, awardedMarks: 2 }, "raw").descriptorHits).toEqual([]);
    expect(parseBandPlacement({ levelPlacement: 1, awardedMarks: 2, descriptorHits: null }, "raw").descriptorHits).toEqual([]);
    expect(() =>
      parseBandPlacement({ levelPlacement: 1, awardedMarks: 2, descriptorHits: [{ levelIndex: 1.5 }] }, "raw"),
    ).toThrow(CandidateGenerationError);
    expect(() =>
      parseBandPlacement({ levelPlacement: 1, awardedMarks: 2, descriptorHits: ["nope"] }, "raw"),
    ).toThrow(CandidateGenerationError);
    // hit:false entries and missing rationales parse honestly (transparency, not gate)
    expect(parseBandPlacement({ levelPlacement: 1, awardedMarks: 2, descriptorHits: [{ levelIndex: 1, hit: false }] }, "raw").descriptorHits).toEqual([
      { levelIndex: 1, hit: false, rationale: "" },
    ]);
  });
});

describe("chainAsBandCandidateGenerator — the seam over THE ONE chain", () => {
  test("happy path: single-part propose rides the band prompt + budget", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { chain } = fakeChain({ text: OK_JSON }, { calls });
    const gen = chainAsBandCandidateGenerator(chain);
    const candidate = await gen.proposeBand(bandContext());
    expect(candidate.modelId).toBe("glm-4.6");
    expect(candidate.levelPlacement).toBe(2);
    expect(candidate.awardedMarks).toBe(3);
    expect(candidate.rawOutput).toBe(OK_JSON);
    expect(calls).toHaveLength(1);
    const request = calls[0]!;
    expect(request.temperature).toBe(0.1);
    expect(request.reasoningEffort).toBe("low");
    expect(request.maxTokens).toBe(800 + 400 * 4);
    expect(String(request.system)).toContain("levels-of-response mark scheme");
  });

  test("unavailable chain → PROVIDER_UNAVAILABLE; truncation → TRUNCATED_OUTPUT with the raw text", async () => {
    const { chain: down } = fakeChain({ text: OK_JSON }, { available: false });
    await expect(chainAsBandCandidateGenerator(down).proposeBand(bandContext())).rejects.toThrow(CandidateGenerationError);
    const { chain: truncating } = fakeChain({ text: OK_JSON, finishReason: "length" });
    try {
      await chainAsBandCandidateGenerator(truncating).proposeBand(bandContext());
      throw new Error("expected truncation refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(CandidateGenerationError);
      expect((e as CandidateGenerationError).reason).toBe("TRUNCATED_OUTPUT");
      expect((e as CandidateGenerationError).rawOutput).toBe(OK_JSON);
    }
  });

  test("unparseable body → UNPARSEABLE_OUTPUT with the raw text attached", async () => {
    const { chain } = fakeChain({ text: "no json here at all" });
    try {
      await chainAsBandCandidateGenerator(chain).proposeBand(bandContext());
      throw new Error("expected parse refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(CandidateGenerationError);
      expect((e as CandidateGenerationError).reason).toBe("UNPARSEABLE_OUTPUT");
    }
  });

  test("the correction envelope rides the retry call's user prompt", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { chain } = fakeChain({ text: OK_JSON }, { calls });
    const gen = chainAsBandCandidateGenerator(chain);
    await gen.proposeBand(bandContext(), { violations: ["band-range: awarded marks 9 fall outside the placed level 2 range 3..4"] });
    expect(String(calls[0]!.user)).toContain("RANGE CORRECTION (your previous placement was rejected):");
  });

  test("batch: exactly one uniquely-numbered object per context; misalignment refuses the whole batch", async () => {
    const batchJson =
      '{"parts":[' +
      '{"part":1,"confidence":0.8,"levelPlacement":1,"awardedMarks":2,"descriptorHits":[]},' +
      '{"part":2,"confidence":0.9,"levelPlacement":2,"awardedMarks":4,"descriptorHits":[{"levelIndex":2,"hit":true,"rationale":"precise"}]}]}';
    const calls: Array<Record<string, unknown>> = [];
    const { chain } = fakeChain({ text: batchJson }, { calls });
    const gen = chainAsBandCandidateGenerator(chain);
    const contexts = [bandContext(), bandContext({ answer: { ...bandContext().answer, label: "(b)", partMarks: 6 } })];
    const candidates = await gen.proposeBandsAll(contexts);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.awardedMarks).toBe(2);
    expect(candidates[1]!.awardedMarks).toBe(4);
    // the batch budget rides the SUM of the parts' printed marks (4 + 6), capped at 8k
    expect(calls[0]!.maxTokens).toBe(800 + 400 * 10);

    const { chain: misaligned } = fakeChain({ text: '{"parts":[{"part":2,"levelPlacement":1,"awardedMarks":2,"descriptorHits":[]}]}' });
    await expect(chainAsBandCandidateGenerator(misaligned).proposeBandsAll(contexts)).rejects.toThrow(CandidateGenerationError);
  });
});
