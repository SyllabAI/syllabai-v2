/**
 * Lane E engine tests (T-MG-MARK-DELTA-1 run-001) — the 2026-11-04
 * live-capture contract delta, over REAL services on stubbed sql with
 * deterministic model fakes (the service.test.ts posture).
 *
 * Pins of record (docs/MG-MARK-ROLLOUT-PLAN.md §3 Lane E):
 *   (citation pin) verdict points MAY carry workingRef; the echoed label is
 *     resolved to the GIVEN working block (the model never mints ledger
 *     truth); an unknown label is an honest marking_output_invalid; the
 *     citation wins the row's working_ref and the run's own block shifts
 *     to the first uncited row;
 *   (attempt pin) the verdict's attempt classification lands on every
 *     award row (nullable — absence honest);
 *   (stem pin) the question stem rides the doctrine-match prompt as
 *     CONTEXT ONLY; the transcription prompt never sees it;
 *   (cache pin) the content hash ({content bytes, ink-doc revision,
 *     mark_points version}) stamps the rows; an identical re-mark
 *     short-circuits to the standing award (zero model calls, cached
 *     receipt); forceFresh forces the fresh job.
 */
import { describe, expect, test } from "bun:test";
import { PaperMarking, parseVerdict } from "../../src/services/paper-marking";
import { PAPER_MARK_SYSTEM_PROMPT, CROP_TRANSCRIPTION_SYSTEM_PROMPT, buildMarkingUserPrompt } from "../../src/services/paper-marking/prompt";
import { PaperAwards, createPaperAwardPublisher } from "../../src/services/paper-awards";
import type { TranscriptionProvider } from "../../src/services/answer-input/service";
import type { PaperMarkingLlm } from "../../src/services/paper-marking";
import type { SqlFn } from "../../src/services/paper-marking/sql";

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const PAPER = "47000000-0000-4000-8000-000000000001";
const PART_A = "51000000-0000-4000-8000-000000000001";
const QUESTION = "52000000-0000-4000-8000-000000000001";
const BLOCK_1 = "55000000-0000-4000-8000-000000000001";
const BLOCK_2 = "55000000-0000-4000-8000-000000000002";
const PNG_CROP = "data:image/png;base64,aGVsbG8gd29ybGQ="; // "hello world"

const DEFS_A = [
  { id: "61000000-0000-4000-8000-000000000001", ref: "P1", ordering: 0, text: "works out the scale factor", marks: 1, acceptance_criteria: null },
  { id: "61000000-0000-4000-8000-000000000002", ref: "C1", ordering: 1, text: "correct conclusion with working shown", marks: 1, acceptance_criteria: null },
];

interface Route {
  match: RegExp;
  rows?: Array<Record<string, unknown>>;
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
}

/** The Lane E stub world: the bridge row CARRIES the part's printed stem
 * (p.prompt as stem — the Lane E select), two prior working blocks ride
 * the context seam, and the claim/ink/cache routes capture their params. */
function makeLaneESql(opts: { standingRows?: Array<Record<string, unknown>>; standingOnce?: boolean; inkRevision?: number } = {}) {
  const claims: unknown[][] = [];
  const blockInserts: unknown[][] = [];
  let standingServed = false;
  const routes: Route[] = [
    {
      match: /from question_parts p join question_versions v/,
      rowsFor: (params) =>
        params[0] === PART_A
          ? [{ part_id: PART_A, label: "a", stem: "Here is a recipe for 4 people. Kai needs 8 people.", ordering: 0, question_id: QUESTION }]
          : [],
    },
    {
      match: /from questions q where q\.id = \?/,
      rowsFor: (params) =>
        params[0] === QUESTION ? [{ question_id: QUESTION, external_ref: "17", exam_paper_id: PAPER }] : [],
    },
    {
      match: /from mark_points mp where mp\.question_part_id/,
      rowsFor: (params) => (params[0] === PART_A ? DEFS_A : []),
    },
    { match: /min\(r\.page\)/, rows: [{ page: 2 }] },
    {
      match: /from mark_working_blocks\s+where learner_id/,
      rows: [
        { id: BLOCK_1, kind: "ink", content: { transcription: "W1 content" }, created_at: "2026-11-03T09:00:00Z" },
        { id: BLOCK_2, kind: "text", content: { answerHtml: "<p>W2 content</p>" }, created_at: "2026-11-03T10:00:00Z" },
      ],
    },
    {
      match: /select revision\s+from learner_pdf_drawings/,
      rows: opts.inkRevision === undefined ? [] : [{ revision: opts.inkRevision }],
    },
    {
      match: /a\.cache_hash = \?/,
      rowsFor: () => {
        // standingOnce: the standing award answers ONLY the first cache
        // probe — a different content hash (an edited answer / moved ink
        // revision) misses and runs fresh (the honest live behavior).
        if (opts.standingRows && opts.standingOnce) {
          if (standingServed) return [];
          standingServed = true;
          return opts.standingRows;
        }
        return opts.standingRows ?? [];
      },
    },
    {
      match: /insert into mark_awards/,
      rowsFor: (params) => {
        claims.push(params as unknown[]);
        return [{ id: crypto.randomUUID() }];
      },
    },
    {
      match: /insert into mark_working_blocks/,
      rowsFor: (params) => {
        blockInserts.push(params as unknown[]);
        return [{ id: crypto.randomUUID() }];
      },
    },
  ];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    const hit = routes.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : (hit.rows ?? []);
  }) as unknown as SqlFn;
  return { sql, claims, blockInserts };
}

const recordingTranscriber = (text = "transcribed working") => {
  const calls: Array<{ user: string; system: string }> = [];
  const fake: TranscriptionProvider = {
    generate: async (req) => {
      calls.push({ user: req.userPrompt, system: req.systemPrompt });
      return { text, providerName: "fake", model: "fake-vision", latencyMs: 1 };
    },
  };
  return { fake, calls };
};

const marker = (verdict: unknown) => {
  const calls: Array<{ user: string; system: string }> = [];
  const fake: PaperMarkingLlm = {
    generate: async (req) => {
      calls.push({ user: req.user, system: req.system });
      return { text: JSON.stringify(verdict) };
    },
  };
  return { fake, calls };
};

const okVerdict = (over: Record<string, unknown> = {}) => ({
  chatMessage: "Two points considered.",
  attempt: "full",
  reasoning: "transcribed working\n\nP1 shown; C1 bare conclusion.",
  points: [
    { ref: "P1", awarded: true, comment: "shown in the attempt" },
    { ref: "C1", awarded: false, comment: "the conclusion alone earns no marks" },
  ],
  strategiesForImprovement: ["Show the working step."],
  ...over,
});

const marking = (sql: SqlFn, transcriber: TranscriptionProvider | null, llm: PaperMarkingLlm | null) =>
  new PaperMarking(sql, new PaperAwards(sql, createPaperAwardPublisher(sql)), transcriber, llm);

// insert params of record (the publisher's column order; gen_random_uuid()
// is SQL-side — the params start at the learner):
// 0 learner, 1 type, 2 doc, 3 region, 4 markPointId, 5 page, 6 code,
// 7 awarded, 8 score, 9 maxScore, 10 ordinal, 11 working_ref, 12 pipeline,
// 13 feedback, 14 attempt_class, 15 cache_hash
const WORKING_REF_PARAM = 11;
const ATTEMPT_PARAM = 14;
const HASH_PARAM = 15;

describe("Lane E — parse law (the verdict shape, validated never trusted)", () => {
  test("attempt: the three observed classes parse; invalid enum → marking_output_invalid; absent → null", () => {
    for (const a of ["full", "partial", "blank"]) {
      const v = parseVerdict(JSON.stringify(okVerdict({ attempt: a })));
      expect(v.attempt).toBe(a);
    }
    const absent = parseVerdict(JSON.stringify(okVerdict({ attempt: undefined })));
    expect(absent.attempt).toBeNull();
    expect(() => parseVerdict(JSON.stringify(okVerdict({ attempt: "everything" })))).toThrow(
      "must be one of full | partial | blank",
    );
  });

  test("workingRef: optional per point, echoed verbatim; present-but-empty → invalid", () => {
    const v = parseVerdict(
      JSON.stringify(
        okVerdict({
          points: [
            { ref: "P1", awarded: true, comment: "c", workingRef: "W2" },
            { ref: "C1", awarded: false, comment: "c" },
          ],
        }),
      ),
    );
    expect(v.points[0]!.workingRef).toBe("W2");
    expect(v.points[1]!.workingRef).toBeNull();
    expect(() =>
      parseVerdict(
        JSON.stringify(okVerdict({ points: [{ ref: "P1", awarded: true, comment: "c", workingRef: "   " }] })),
      ),
    ).toThrow("must be a non-empty string when present");
  });
});

describe("Lane E — the citation pin (prompt + resolution, the ledger law untouched)", () => {
  test("the prompt carries the identity-signed citation/context/attempt sentences and the W-labels", () => {
    expect((PAPER_MARK_SYSTEM_PROMPT.match(/paper-mark\/v1/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(PAPER_MARK_SYSTEM_PROMPT).toContain("Evidence citations (paper-mark/v1)");
    expect(PAPER_MARK_SYSTEM_PROMPT).toContain("Attempt classification (paper-mark/v1)");
    expect(PAPER_MARK_SYSTEM_PROMPT).toContain("Context law (paper-mark/v1)");
    const user = buildMarkingUserPrompt({
      regionLabel: "17.a",
      points: [{ ref: "P1", text: "t", marks: 1, acceptanceCriteria: null }],
      stemContext: "the printed question",
      workingContext: ["W1 — 2026-11-03T09:00:00Z (ink): first block", "W2 — 2026-11-03T10:00:00Z (text): second block"],
      transcription: "the attempt",
    });
    expect(user).toContain("Question stem (context only — never a mark source)");
    expect(user).toContain("the printed question");
    expect(user).toContain("W1 — ");
    expect(user).toContain("W2 — ");
    // the stem never rides the transcription prompt (the scoping rule is
    // byte-identical — no stem parameter exists there)
    expect(CROP_TRANSCRIPTION_SYSTEM_PROMPT).not.toContain("stem");
  });

  test("a cited point resolves to the GIVEN block id; the citation wins the row's working_ref and the run's own block shifts to the first uncited row", async () => {
    const { sql, claims, blockInserts } = makeLaneESql();
    const trans = recordingTranscriber();
    const mark = marker(
      okVerdict({
        points: [
          { ref: "P1", awarded: true, comment: "rests on the saved working", workingRef: "W2" },
          { ref: "C1", awarded: false, comment: "not evidenced" },
        ],
      }),
    );
    const m = marking(sql, trans.fake, mark.fake);
    const plan = await m.plan(PART_A);
    const res = await m.markRegion({ learnerId: LEARNER, plan, imageDataUrl: PNG_CROP });
    expect(res.receipt.emitted).toBe(2);
    // row 0's working_ref = the CITED block (BLOCK_2), not the run's own
    expect(claims[0]![WORKING_REF_PARAM]).toBe(BLOCK_2);
    // row 1 (uncited) carries the run's own generated block uuid — and the
    // block insert fired exactly once (zero-orphan: the citation skipped it)
    const ownRef = claims[1]![WORKING_REF_PARAM];
    expect(typeof ownRef).toBe("string");
    expect(ownRef).not.toBe(BLOCK_1);
    expect(ownRef).not.toBe(BLOCK_2);
    expect(blockInserts.length).toBe(1);
    expect(blockInserts[0]![0]).toBe(ownRef);
    // the assembled job view carries the echoed label
    expect(res.awards[0]!.workingRefLabel).toBe("W2");
    expect(res.awards[0]!.workingRefCitation).toBe(BLOCK_2);
    expect(res.awards[1]!.workingRefLabel).toBeUndefined();
  });

  test("an echoed label with no matching given block → honest marking_output_invalid, zero claims", async () => {
    const { sql, claims } = makeLaneESql();
    const trans = recordingTranscriber();
    const mark = marker(okVerdict({ points: [{ ref: "P1", awarded: true, comment: "c", workingRef: "W9" }, { ref: "C1", awarded: false, comment: "c" }] }));
    const m = marking(sql, trans.fake, mark.fake);
    const plan = await m.plan(PART_A);
    await expect(m.markRegion({ learnerId: LEARNER, plan, imageDataUrl: PNG_CROP })).rejects.toThrow(
      "no such working block was given",
    );
    expect(claims.length).toBe(0);
  });

  test("all-cited rows: the run's own block honestly skips (the transcription lives in thoughtProcess)", async () => {
    const { sql, claims, blockInserts } = makeLaneESql();
    const trans = recordingTranscriber();
    const mark = marker(
      okVerdict({
        points: [
          { ref: "P1", awarded: true, comment: "c", workingRef: "W1" },
          { ref: "C1", awarded: false, comment: "c", workingRef: "W2" },
        ],
      }),
    );
    const m = marking(sql, trans.fake, mark.fake);
    const plan = await m.plan(PART_A);
    const res = await m.markRegion({ learnerId: LEARNER, plan, imageDataUrl: PNG_CROP });
    expect(blockInserts.length).toBe(0);
    expect(res.awards.every((a) => a.working === undefined)).toBe(true);
    expect(claims[0]![WORKING_REF_PARAM]).toBe(BLOCK_1);
    expect(claims[1]![WORKING_REF_PARAM]).toBe(BLOCK_2);
  });
});

describe("Lane E — the attempt pin (stored on mark_awards, one additive migration)", () => {
  test("the classification stamps EVERY row; cache_hash rides the rows; absence stays nullable", async () => {
    const { sql, claims } = makeLaneESql({ inkRevision: 4 });
    const trans = recordingTranscriber();
    const mark = marker(okVerdict({ attempt: "partial" }));
    const m = marking(sql, trans.fake, mark.fake);
    const plan = await m.plan(PART_A);
    const res = await m.markRegion({ learnerId: LEARNER, plan, imageDataUrl: PNG_CROP });
    expect(claims.length).toBe(2);
    expect(claims[0]![ATTEMPT_PARAM]).toBe("partial");
    expect(claims[1]![ATTEMPT_PARAM]).toBe("partial");
    const h0 = claims[0]![HASH_PARAM];
    expect(typeof h0).toBe("string");
    expect((h0 as string).length).toBe(64); // sha256 hex
    expect(h0).toBe(claims[1]![HASH_PARAM]); // one run = one hash
    expect(res.awards.every((a) => a.attemptClass === "partial")).toBe(true);
    // the same content + same ink revision + same scheme → the SAME hash
    const { sql: sql2, claims: claims2 } = makeLaneESql({ inkRevision: 4 });
    const m2 = marking(sql2, recordingTranscriber().fake, marker(okVerdict({ attempt: "full" })).fake);
    const plan2 = await m2.plan(PART_A);
    await m2.markRegion({ learnerId: LEARNER, plan: plan2, imageDataUrl: PNG_CROP, forceFresh: true });
    expect(claims2[0]![HASH_PARAM]).toBe(h0);
  });
});

describe("Lane E — the cache pin (identical re-marks short-circuit; mark again forces fresh)", () => {
  const standing = [
    {
      code: "P1", awarded: true, score: 1, max_score: 1, ordinal: 0,
      mark_point_id: DEFS_A[0]!.id, page: 2, pipeline_version: "paper-mark/v1",
      feedback: { attempt: "old transcription", chatMessage: "standing", pointsScored: ["P1: t — c"], pointsNotScored: [], thoughtProcess: "old transcription", strategiesForImprovement: [] },
      attempt_class: "full",
    },
    {
      code: "C1", awarded: false, score: 0, max_score: 1, ordinal: 1,
      mark_point_id: DEFS_A[1]!.id, page: 2, pipeline_version: "paper-mark/v1",
      feedback: { attempt: "old transcription", chatMessage: "standing", pointsScored: ["P1: t — c"], pointsNotScored: [], thoughtProcess: "old transcription", strategiesForImprovement: [] },
      attempt_class: null,
    },
  ];

  test("an identical re-mark returns the STANDING award — zero model calls, zero writes, receipt.cached", async () => {
    const { sql, claims } = makeLaneESql({ standingRows: standing, inkRevision: 4 });
    const trans = recordingTranscriber();
    const mark = marker(okVerdict());
    const m = marking(sql, trans.fake, mark.fake);
    const plan = await m.plan(PART_A);
    const res = await m.regradePart({ learnerId: LEARNER, plan, answerHtml: "the same answer" });
    expect(res.receipt).toEqual({ emitted: 0, suppressed: 0, workingBlocks: 0, cached: true });
    expect(res.feedback.chatMessage).toBe("standing");
    expect(res.transcription).toBe("old transcription");
    expect(res.awards.length).toBe(2);
    expect(res.awards[0]!.attemptClass).toBe("full");
    expect(res.awards[1]!.attemptClass).toBeNull(); // honest absence
    expect(mark.calls.length).toBe(0);
    expect(trans.calls.length).toBe(0);
    expect(claims.length).toBe(0);
  });

  test("forceFresh bypasses the standing award and runs the fresh job (MG's re-mark semantics)", async () => {
    const { sql, claims } = makeLaneESql({ standingRows: standing, inkRevision: 4 });
    const trans = recordingTranscriber();
    const mark = marker(okVerdict({ attempt: "partial" }));
    const m = marking(sql, trans.fake, mark.fake);
    const plan = await m.plan(PART_A);
    const res = await m.regradePart({ learnerId: LEARNER, plan, answerHtml: "the same answer", forceFresh: true });
    expect(res.receipt.cached).toBeUndefined();
    expect(res.feedback.chatMessage).toBe("Two points considered.");
    expect(mark.calls.length).toBe(1);
    expect(claims.length).toBe(2);
    expect(claims[0]![ATTEMPT_PARAM]).toBe("partial");
  });

  test("an edited answer (a different content hash) misses the cache and runs fresh", async () => {
    const { sql, claims } = makeLaneESql({ standingRows: standing, standingOnce: true, inkRevision: 4 });
    const trans = recordingTranscriber();
    const mark = marker(okVerdict());
    const m = marking(sql, trans.fake, mark.fake);
    const plan = await m.plan(PART_A);
    // first mark: the identical-content short-circuit serves the standing row
    const hit = await m.regradePart({ learnerId: LEARNER, plan, answerHtml: "the same answer" });
    expect(hit.receipt.cached).toBe(true);
    // second mark: the learner EDITED the answer — a different hash misses
    // the standing award and the fresh job runs (one doctrine-match call)
    const miss = await m.regradePart({ learnerId: LEARNER, plan, answerHtml: "an edited answer" });
    expect(miss.receipt.cached).toBeUndefined();
    expect(miss.feedback.chatMessage).toBe("Two points considered.");
    expect(mark.calls.length).toBe(1);
    expect(claims.length).toBe(2);
  });

  test("a moved ink-doc revision changes the content hash (the {crop, ink, scheme} triple)", async () => {
    const a = makeLaneESql({ inkRevision: 4 });
    const m1 = marking(a.sql, recordingTranscriber().fake, marker(okVerdict()).fake);
    const p1 = await m1.plan(PART_A);
    await m1.markRegion({ learnerId: LEARNER, plan: p1, imageDataUrl: PNG_CROP, forceFresh: true });
    const b = makeLaneESql({ inkRevision: 5 });
    const m2 = marking(b.sql, recordingTranscriber().fake, marker(okVerdict()).fake);
    const p2 = await m2.plan(PART_A);
    await m2.markRegion({ learnerId: LEARNER, plan: p2, imageDataUrl: PNG_CROP, forceFresh: true });
    expect(a.claims[0]![HASH_PARAM]).not.toBe(b.claims[0]![HASH_PARAM]);
  });
});
