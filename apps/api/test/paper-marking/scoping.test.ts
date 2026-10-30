/**
 * The SCOPING PIN (plan §3.4, pin b) — the §1.8 9.b proof made into our
 * regression test: crop-then-mark PHYSICALLY bounds what the pipeline
 * sees. A two-region fixture where ink/crop/context/definitions from
 * region A must be invisible to region B's marking — enforced BY
 * CONSTRUCTION at every seam the pipeline owns:
 *   - the transcriber receives ONLY the calling region's crop;
 *   - the marker receives ONLY the calling region's definition rows and
 *     THIS learner's prior working blocks for THIS regionKey;
 *   - the award rows land under each region's own regionKey with each
 *     region's own definition truth.
 * ("The handwriting in part (a) is outside the scope of this marking.")
 */
import { describe, expect, test } from "bun:test";
import { PaperMarking, type PaperMarkingLlm } from "../../src/services/paper-marking";
import { PaperAwards, createPaperAwardPublisher } from "../../src/services/paper-awards";
import type { TranscriptionProvider } from "../../src/services/answer-input/service";
import type { SqlFn } from "../../src/services/paper-marking/sql";

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const PAPER = "47000000-0000-4000-8000-000000000001";
const QUESTION = "52000000-0000-4000-8000-000000000001";
const PART_A = "51000000-0000-4000-8000-000000000001"; // 17.a
const PART_B = "51000000-0000-4000-8000-000000000002"; // 17.b

/** A's ink world: the scale-factor three-point region. */
const DEFS_A = [
  { id: "61000000-0000-4000-8000-000000000001", ref: "P1", ordering: 0, text: "A-ONLY: works out the scale factor", marks: 1, acceptance_criteria: null },
  { id: "61000000-0000-4000-8000-000000000002", ref: "P1", ordering: 1, text: "A-ONLY: applies the factor to the flour", marks: 1, acceptance_criteria: null },
  { id: "61000000-0000-4000-8000-000000000003", ref: "C1", ordering: 2, text: "A-ONLY: correct conclusion with working", marks: 1, acceptance_criteria: null },
];
/** B's ink world: a one-point answer-line region. */
const DEFS_B = [
  { id: "61000000-0000-4000-8000-000000000004", ref: "B1", ordering: 0, text: "B-ONLY: states the final amount", marks: 1, acceptance_criteria: null },
];

const CROP_A = "data:image/png;base64,Q1JPUC1B"; // "CROP-A"
const CROP_B = "data:image/png;base64,Q1JPUC1C"; // "CROP-C"

function makeSql() {
  const contextRows: Array<Record<string, unknown>> = [
    // A's saved context — must NEVER appear in B's marker prompt.
    { id: "55000000-0000-4000-8000-000000000001", kind: "ink", content: { transcription: "A-region ink: x + 5 (Katy is 5 years younger)" }, created_at: "2026-10-30T09:00:00Z" },
  ];
  const issued: string[] = [];
  const routes: Array<{ match: RegExp; rowsFor: (params: unknown[]) => Array<Record<string, unknown>> }> = [
    {
      match: /from question_parts p join question_versions v/,
      rowsFor: (params) => {
        const byPart: Record<string, Array<Record<string, unknown>>> = {
          [PART_A]: [{ part_id: PART_A, label: "a", ordering: 0, question_id: QUESTION }],
          [PART_B]: [{ part_id: PART_B, label: "b", ordering: 1, question_id: QUESTION }],
        };
        return byPart[String(params[0])] ?? [];
      },
    },
    {
      match: /from questions q where q\.id = \?/,
      rowsFor: () => [{ question_id: QUESTION, external_ref: "17", exam_paper_id: PAPER }],
    },
    {
      match: /from mark_points mp where mp\.question_part_id/,
      rowsFor: (params) => (params[0] === PART_A ? DEFS_A : params[0] === PART_B ? DEFS_B : []),
    },
    { match: /min\(r\.page\)/, rowsFor: () => [{ page: 3 }] },
    {
      match: /from mark_working_blocks\s+where learner_id/,
      rowsFor: (params) => (params[3] === "17.a" ? contextRows : []), // the region-scoped context seam
    },
    { match: /insert into mark_awards/, rowsFor: () => [{ id: crypto.randomUUID() }] },
    { match: /insert into mark_working_blocks/, rowsFor: () => [{ id: crypto.randomUUID() }] },
  ];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    issued.push(text);
    const hit = routes.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor(params);
  }) as unknown as SqlFn;
  return { sql, issued, contextRows };
}

describe("PIN (b) — the two-region scoping fixture (the §1.8 9.b proof as a regression test)", () => {
  test("A's crop, A's definitions, A's context and A's verdict are invisible to B's marking", async () => {
    const { sql } = makeSql();

    // the transcriber seam records EVERY crop it is offered.
    const tCalls: Array<{ user: string; base64: string; mimeType: string; system: string }> = [];
    const transcriber: TranscriptionProvider = {
      generate: async (req) => {
        tCalls.push({ user: req.userPrompt, base64: req.media.base64, mimeType: req.media.mimeType, system: req.systemPrompt });
        return req.media.base64 === "Q1JPUC1B"
          ? { text: "A-transcription: 15÷10 = 1.5, 200 × 1.5 = 300 ml", providerName: "fake", model: "fake-vision", latencyMs: 1 }
          : { text: "B-transcription: 300 ml", providerName: "fake", model: "fake-vision", latencyMs: 1 };
      },
    };

    // the marker seam records EVERY user prompt + emits a verdict whose
    // reasoning quotes exactly one region's transcription (the honest
    // per-region voice).
    const mUsers: string[] = [];
    const marker: PaperMarkingLlm = {
      generate: async (req) => {
        mUsers.push(req.user);
        const defs = req.user.includes("A-ONLY") ? "A" : "B";
        const t = req.user.includes("A-transcription") ? "A-transcription: 15÷10 = 1.5, 200 × 1.5 = 300 ml" : "B-transcription: 300 ml";
        const n = req.user.includes("A-ONLY") ? 3 : 1;
        const body = defs === "A"
          ? `${t}\n\nA-ONLY reasoning on the scale-factor region.`
          : `${t}\n\nB-ONLY reasoning on the final-amount region.`;
        return {
          text: JSON.stringify({
            chatMessage: defs === "A" ? "Show the factor step." : "Correct.",
            reasoning: body,
            points:
              defs === "A"
                ? [
                    { ref: "P1", awarded: true, comment: "A factor shown" },
                    { ref: "P1", awarded: false, comment: "A flour step missing" },
                    { ref: "C1", awarded: false, comment: "A conclusion unsupported" },
                  ]
                : [{ ref: "B1", awarded: true, comment: "B amount stated" }],
            strategiesForImprovement: [],
          }),
        };
      },
    };

    const awards = new PaperAwards(sql, createPaperAwardPublisher(sql));
    const marking = new PaperMarking(sql, awards, transcriber, marker);

    // ── run region A then region B (the two independent pipeline runs) ──
    const planA = await marking.plan(PART_A);
    const runA = await marking.markRegion({ learnerId: LEARNER, plan: planA, imageDataUrl: CROP_A });
    const planB = await marking.plan(PART_B);
    const runB = await marking.markRegion({ learnerId: LEARNER, plan: planB, imageDataUrl: CROP_B });

    // 1. the transcriber saw each region's OWN crop, once each — B never
    //    received A's crop bytes (the crop-then-mark law at the vision seam).
    expect(tCalls.length).toBe(2);
    expect(tCalls[0]!.base64).toBe("Q1JPUC1B");
    expect(tCalls[1]!.base64).toBe("Q1JPUC1C");
    expect(tCalls[1]!.base64).not.toBe(tCalls[0]!.base64);

    // 2. B's marker prompt holds B's definitions ONLY — no A-ONLY text, no
    //    A's saved context (the region-scoped context seam), no A's
    //    transcription.
    expect(mUsers.length).toBe(2);
    expect(mUsers[0]).toContain("A-ONLY");
    expect(mUsers[0]).toContain("A-region ink"); // A's context rides A's prompt
    expect(mUsers[1]).toContain("B-ONLY");
    expect(mUsers[1]).not.toContain("A-ONLY");
    expect(mUsers[1]).not.toContain("A-region ink");
    expect(mUsers[1]).not.toContain("15÷10");

    // 3. the award rows land under each region's own regionKey with each
    //    region's own definition truth (ordinals are per-region).
    expect(runA.regionKey).toBe("17.a");
    expect(runB.regionKey).toBe("17.b");
    expect(runA.awards.map((a) => a.markPointId)).toEqual(DEFS_A.map((d) => d.id));
    expect(runB.awards.map((a) => a.markPointId)).toEqual([DEFS_B[0]!.id]);
    expect(runA.awards.every((a) => a.code !== "B1")).toBe(true);
    expect(runB.awards.every((a) => a.code !== "P1" && a.code !== "C1")).toBe(true);

    // 4. each region's feedback voice is its OWN transcription — B's
    //    attempt/thoughtProcess never quote A's ink (the 9.b sentence's
    //    pipeline-side guarantee).
    expect(runA.feedback.attempt.startsWith("A-transcription")).toBe(true);
    expect(runB.feedback.attempt.startsWith("B-transcription")).toBe(true);
    expect(runB.feedback.thoughtProcess).not.toContain("A-transcription");
    expect(runB.feedback.thoughtProcess).not.toContain("scale factor");
  });
});
