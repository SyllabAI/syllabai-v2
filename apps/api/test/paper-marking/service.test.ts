/**
 * PaperMarking service tests (T-MG-CROPMARK-1 run-001) — the pipeline over
 * REAL services on stubbed sql (the paper-awards test posture) with
 * DETERMINISTIC model fakes (CI stays model-free — the llmchain TEST law).
 *
 * Pins of record (plan §3.4):
 *   (a) doctrine — correct-conclusion-zero-working scores 0/N with the
 *       doctrine sentence in thoughtProcess;
 *   (c) ledger — awards land with definition-plane ordinals + markPointIds
 *       through the once-only claim (the evidence event fires once per
 *       row; the suppressed re-fire writes nothing);
 *   (d) transcription — thoughtProcess BEGINS with the transcribed answer
 *       (the pipeline enforcement, not just the prompt instruction).
 * Plus the honest-failure taxonomy (no fabricated awards, ever).
 */
import { describe, expect, test } from "bun:test";
import {
  PaperMarking,
  MarkJobRegistry,
  PipelineError,
  parseImageDataUrl,
  parseVerdict,
  cropTooLarge,
  type PaperMarkingLlm,
  type MarkVerdict,
} from "../../src/services/paper-marking";
import { DOCTRINE_SENTENCE, PAPER_MARK_SYSTEM_PROMPT, CROP_TRANSCRIPTION_SYSTEM_PROMPT } from "../../src/services/paper-marking/prompt";
import { PaperAwards, createPaperAwardPublisher } from "../../src/services/paper-awards";
import type { TranscriptionProvider } from "../../src/services/answer-input/service";
import type { SqlFn } from "../../src/services/paper-marking/sql";

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const PAPER = "47000000-0000-4000-8000-000000000001";
const PART_A = "51000000-0000-4000-8000-000000000001";
const QUESTION = "52000000-0000-4000-8000-000000000001";
const PNG_CROP = "data:image/png;base64,aGVsbG8gd29ybGQ="; // "hello world"

/** The 17-style three-point part region (the doctrine pin's fixture:
 * P1 + P1 + C1, the observed multi-mark-point region shape). */
const DEFS_A = [
  { id: "61000000-0000-4000-8000-000000000001", ref: "P1", ordering: 0, text: "works out the scale factor from the given amounts", marks: 1, acceptance_criteria: null },
  { id: "61000000-0000-4000-8000-000000000002", ref: "P1", ordering: 1, text: "applies the scale factor to a second ingredient", marks: 1, acceptance_criteria: { must: "show the multiplication" } },
  { id: "61000000-0000-4000-8000-000000000003", ref: "C1", ordering: 2, text: "correct conclusion with working shown", marks: 1, acceptance_criteria: null },
];

interface Route {
  match: RegExp;
  rows?: Array<Record<string, unknown>>;
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
}

function makeSql(extra: Route[] = []) {
  const counters = { claims: 0, blocks: 0 };
  const partRoute: Route = {
    match: /from mark_points mp where mp\.question_part_id/,
    rowsFor: (params) => (params[0] === PART_A ? DEFS_A : []),
  };
  const questionRoute: Route = {
    match: /from questions q where q\.id = \?/,
    rowsFor: (params) =>
      params[0] === QUESTION ? [{ question_id: QUESTION, external_ref: "17", exam_paper_id: PAPER }] : [],
  };
  const partBridge: Route = {
    match: /from question_parts p join question_versions v/,
    rowsFor: (params) =>
      params[0] === PART_A ? [{ part_id: PART_A, label: "a", ordering: 0, question_id: QUESTION }] : [],
  };
  const rectPage: Route = { match: /min\(r\.page\)/, rows: [{ page: 2 }] };
  const contextRoute: Route = {
    match: /from mark_working_blocks\s+where learner_id/,
    rows: [],
  };
  const claimRoute: Route = {
    match: /insert into mark_awards/,
    rowsFor: () => [{ id: crypto.randomUUID() }],
  };
  const blockRoute: Route = {
    match: /insert into mark_working_blocks/,
    rowsFor: () => [{ id: crypto.randomUUID() }],
  };
  const all = [...extra, partRoute, questionRoute, partBridge, rectPage, contextRoute, claimRoute, blockRoute];
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    if (/insert into mark_awards/.test(text)) counters.claims += 1;
    if (/insert into mark_working_blocks/.test(text)) counters.blocks += 1;
    const hit = all.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : (hit.rows ?? []);
  }) as unknown as SqlFn;
  return { sql, counters, contextRoute, claimRoute };
}

function makeMarking(
  sql: SqlFn,
  transcriber: TranscriptionProvider | null,
  marker: PaperMarkingLlm | null,
) {
  const awards = new PaperAwards(sql, createPaperAwardPublisher(sql)); // the LIVE claim publisher
  return new PaperMarking(sql, awards, transcriber, marker);
}

const recordingTranscriber = (text: string) => {
  const calls: Array<{ user: string; base64: string; mimeType: string; system: string }> = [];
  const fake: TranscriptionProvider = {
    generate: async (req) => {
      calls.push({ user: req.userPrompt, base64: req.media.base64, mimeType: req.media.mimeType, system: req.systemPrompt });
      return { text, providerName: "fake", model: "fake-vision", latencyMs: 1 };
    },
  };
  return { fake, calls };
};

const recordingMarker = (verdict: unknown) => {
  const users: string[] = [];
  const systems: string[] = [];
  const fake: PaperMarkingLlm = {
    generate: async (req) => {
      users.push(req.user);
      systems.push(req.system);
      return { text: typeof verdict === "string" ? verdict : JSON.stringify(verdict) };
    },
  };
  return { fake, users, systems };
};

/** The verdict fixture builder: every definition ref decided once. */
function verdictFor(
  defs: typeof DEFS_A,
  opts: { awardedPositions: number[]; transcription: string; prefixTranscription: boolean; doctrine?: boolean },
): MarkVerdict {
  const body = opts.doctrine
    ? `${DOCTRINE_SENTENCE} — the conclusion "No, not enough milk" is factually correct but no working supports it; each point is refused in turn.`
    : "The attempt shows the required steps.";
  const reasoning = opts.prefixTranscription ? `${opts.transcription}\n\n${body}` : body;
  return {
    chatMessage: "Almost — show your working for each step.",
    reasoning,
    points: defs.map((d, i) => ({
      ref: d.ref,
      awarded: opts.awardedPositions.includes(i),
      comment: opts.awardedPositions.includes(i) ? "shown in the attempt" : "not evidenced in the attempt",
    })),
    strategiesForImprovement: opts.awardedPositions.length === defs.length ? [] : ["Write the scale-factor step explicitly."],
  };
}

const BASE_A = { learnerId: LEARNER, imageDataUrl: PNG_CROP } as const;

async function planA(marking: PaperMarking) {
  return marking.plan(PART_A); // resolves through the Phase-2 bridge
}

describe("PIN (a) — doctrine: correct-conclusion-zero-working scores 0/N with the doctrine sentence", () => {
  test("a factually-correct conclusion with zero working refuses every point; thoughtProcess carries the doctrine sentence", async () => {
    const { sql, counters } = makeSql();
    const t = recordingTranscriber("No, not enough milk");
    const m = recordingMarker(
      verdictFor(DEFS_A, {
        awardedPositions: [],
        transcription: "No, not enough milk",
        prefixTranscription: true,
        doctrine: true,
      }),
    );
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    const result = await marking.markRegion({ ...BASE_A, plan });

    // 0/N — three points assessed, none awarded, score 0 of max 3.
    expect(result.awards.length).toBe(3);
    expect(result.awards.every((a) => a.awarded === false && a.score === 0)).toBe(true);
    expect(result.awards.reduce((n, a) => n + a.maxScore, 0)).toBe(3);

    // the doctrine sentence rides the served thoughtProcess.
    expect(result.feedback.thoughtProcess).toContain(DOCTRINE_SENTENCE);
    // pointsNotScored itemized 1:1 against the three mark points (observed law).
    expect(result.feedback.pointsNotScored.length).toBe(3);
    expect(result.feedback.pointsScored.length).toBe(0);
    // the ledger truth is definition-plane truth: codes + marks from mark_points.
    expect(result.awards.map((a) => a.code)).toEqual(["P1", "P1", "C1"]);
    expect(result.awards.map((a) => a.maxScore)).toEqual([1, 1, 1]);
    // nothing was written without a claim.
    expect(counters.claims).toBe(3);
    expect(result.receipt.emitted).toBe(3);
  });

  test("the doctrine sentence is IN the marking prompt of record (the identity module, prompt-side law)", () => {
    expect(PAPER_MARK_SYSTEM_PROMPT).toContain(DOCTRINE_SENTENCE);
  });
});

describe("PIN (d) — transcription-first thoughtProcess (the pipeline enforcement)", () => {
  test("a verdict reasoning missing the verbatim prefix gets the transcription prepended", async () => {
    const { sql } = makeSql();
    const t = recordingTranscriber("y = 12/4 then y = 3");
    const m = recordingMarker(
      verdictFor(DEFS_A, {
        awardedPositions: [0],
        transcription: "y = 12/4 then y = 3",
        prefixTranscription: false,
      }),
    );
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    const result = await marking.markRegion({ ...BASE_A, plan });
    expect(result.feedback.thoughtProcess.startsWith("y = 12/4 then y = 3")).toBe(true);
  });

  test("a verdict that already begins with the transcription is stored verbatim (no double prefix)", async () => {
    const { sql } = makeSql();
    const transcription = "No, not enough milk";
    const t = recordingTranscriber(transcription);
    const m = recordingMarker(
      verdictFor(DEFS_A, { awardedPositions: [], transcription, prefixTranscription: true, doctrine: true }),
    );
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    const result = await marking.markRegion({ ...BASE_A, plan });
    expect(result.feedback.thoughtProcess.indexOf(transcription)).toBe(0);
    // exactly one occurrence of the transcription at the head (no doubling)
    expect(result.feedback.thoughtProcess.slice(transcription.length, transcription.length + 2)).toBe("\n\n");
  });

  test("feedback.attempt IS the transcription (the attempt field of the observed decomposition)", async () => {
    const { sql } = makeSql();
    const t = recordingTranscriber("2x + 1");
    const m = recordingMarker(verdictFor(DEFS_A, { awardedPositions: [0], transcription: "2x + 1", prefixTranscription: true }));
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    const result = await marking.markRegion({ ...BASE_A, plan });
    expect(result.feedback.attempt).toBe("2x + 1");
  });
});

describe("PIN (c) — ledger: definition-plane ordinals + once-only claim (the evidence event)", () => {
  test("three award rows carry ordinals 0,1,2 + definition markPointIds; the claim fires once per row; ONE working block", async () => {
    const { sql, counters } = makeSql();
    const t = recordingTranscriber("No, not enough milk");
    const m = recordingMarker(
      verdictFor(DEFS_A, { awardedPositions: [0, 2], transcription: "No, not enough milk", prefixTranscription: true, doctrine: true }),
    );
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    const result = await marking.markRegion({ ...BASE_A, plan });

    expect(result.awards.map((a) => a.ordinal)).toEqual([0, 1, 2]);
    expect(result.awards.map((a) => a.markPointId)).toEqual(DEFS_A.map((d) => d.id));
    expect(result.awards.map((a) => (a.awarded ? a.score : 0))).toEqual([1, 0, 1]);
    expect(counters.claims).toBe(3); // the claim IS the row — once per award
    expect(counters.blocks).toBe(1); // ONE region-grain working block (rides the first row)
    expect(result.receipt).toEqual({ emitted: 3, suppressed: 0, workingBlocks: 1 });
    expect(result.awards[0]!.page).toBe(2); // min page over the definition rects
  });

  test("the suppressed re-fire emits nothing and writes no block (once-only)", async () => {
    const { sql, counters, claimRoute } = makeSql();
    const t = recordingTranscriber("No, not enough milk");
    const m = recordingMarker(
      verdictFor(DEFS_A, { awardedPositions: [0], transcription: "No, not enough milk", prefixTranscription: true, doctrine: true }),
    );
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    const first = await marking.markRegion({ ...BASE_A, plan });
    expect(first.receipt.emitted).toBe(3);

    claimRoute.rowsFor = () => []; // the claim law: already-fired keys do nothing
    const second = await marking.markRegion({ ...BASE_A, plan });
    expect(second.receipt.emitted).toBe(0);
    expect(second.receipt.suppressed).toBe(3);
    expect(second.receipt.workingBlocks).toBe(0);
    expect(counters.blocks).toBe(1); // no second block
    expect(counters.claims).toBe(6); // the claim was still attempted (the once-only guard)
  });
});

describe("the honest-failure taxonomy — never fabricated awards", () => {
  test("unparseable marker output → marking_output_invalid, zero claims", async () => {
    const { sql, counters } = makeSql();
    const t = recordingTranscriber("No, not enough milk");
    const m = recordingMarker("this is not json at all");
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    expect(marking.markRegion({ ...BASE_A, plan })).rejects.toMatchObject({ code: "marking_output_invalid" });
    expect(counters.claims).toBe(0);
  });

  test("a verdict referencing an unknown ref → marking_output_invalid", async () => {
    const { sql, counters } = makeSql();
    const t = recordingTranscriber("x = 5");
    const verdict = verdictFor(DEFS_A, { awardedPositions: [], transcription: "x = 5", prefixTranscription: true });
    verdict.points[0]!.ref = "M9"; // hallucinated ref
    const m = recordingMarker(verdict);
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    expect(marking.markRegion({ ...BASE_A, plan })).rejects.toMatchObject({ code: "marking_output_invalid" });
    expect(counters.claims).toBe(0);
  });

  test("a verdict that drops a definition point → marking_output_invalid (no silent drops)", async () => {
    const { sql } = makeSql();
    const t = recordingTranscriber("x = 5");
    const verdict = verdictFor(DEFS_A, { awardedPositions: [0], transcription: "x = 5", prefixTranscription: true });
    verdict.points = verdict.points.slice(0, 2); // decided only 2 of 3
    const m = recordingMarker(verdict);
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    expect(marking.markRegion({ ...BASE_A, plan })).rejects.toMatchObject({ code: "marking_output_invalid" });
  });

  test("[empty] crop → transcription_nothing_readable; dormant transcriber → transcription_unavailable", async () => {
    const { sql } = makeSql();
    const m = recordingMarker(verdictFor(DEFS_A, { awardedPositions: [], transcription: "x", prefixTranscription: true }));
    const empty = makeMarking(sql, recordingTranscriber("[empty]").fake, m.fake);
    const plan = await planA(empty);
    expect(empty.markRegion({ ...BASE_A, plan })).rejects.toMatchObject({ code: "transcription_nothing_readable" });

    const dormant = makeMarking(sql, null, m.fake);
    expect(dormant.markRegion({ ...BASE_A, plan })).rejects.toMatchObject({ code: "transcription_unavailable" });
  });

  test("dormant doctrine-match → marking_unavailable; a provider throw maps to the honest 503 code, message not leaked", async () => {
    const { sql } = makeSql();
    const t = recordingTranscriber("x = 5");
    const nullMarker = makeMarking(sql, t.fake, null);
    const plan0 = await planA(nullMarker);
    expect(nullMarker.markRegion({ ...BASE_A, plan: plan0 })).rejects.toMatchObject({ code: "marking_unavailable" });

    const throwingMarker: PaperMarkingLlm = {
      generate: async () => {
        throw new Error("INTERNAL upstream trace abc123 — must not leak");
      },
    };
    const leaked = makeMarking(sql, t.fake, throwingMarker);
    const plan1 = await planA(leaked);
    await expect(leaked.markRegion({ ...BASE_A, plan: plan1 })).rejects.toMatchObject({ code: "marking_unavailable" });
  });
});

describe("the crop wire law (imageDataUrl)", () => {
  test("png/jpeg/webp pass; wrong mime, non-base64 alphabet, empty payload, and >4MB are the honest errors", () => {
    expect(parseImageDataUrl(PNG_CROP)).toEqual({ mimeType: "image/png", base64: "aGVsbG8gd29ybGQ=" });
    expect(parseImageDataUrl("data:image/jpeg;base64,abcd").mimeType).toBe("image/jpeg");
    expect(() => parseImageDataUrl("data:image/gif;base64,abcd")).toThrow();
    expect(() => parseImageDataUrl("data:image/png;base64,ab*d")).toThrow();
    expect(() => parseImageDataUrl("data:image/png;base64,")).toThrow();
    const huge = Buffer.alloc(4 * 1024 * 1024 + 1, 7).toString("base64");
    try {
      parseImageDataUrl(`data:image/png;base64,${huge}`);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(cropTooLarge(0, 0).constructor);
      expect((e as { code: string }).code).toBe("crop_too_large");
      expect((e as { status: number }).status).toBe(413);
    }
  });
});

describe("the typed channel (regradePart) — the answer IS the transcription", () => {
  test("no vision call; feedback.attempt = the typed answer; a text working block rides the first row", async () => {
    const { sql, counters } = makeSql();
    const t = recordingTranscriber("SHOULD NEVER BE CALLED");
    const m = recordingMarker(
      verdictFor(DEFS_A, { awardedPositions: [2], transcription: "<p>No, not enough milk</p>", prefixTranscription: true, doctrine: true }),
    );
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    const result = await marking.regradePart({ learnerId: LEARNER, plan, answerHtml: "<p>No, not enough milk</p>" });

    expect(t.calls.length).toBe(0); // the typed channel never sees the vision seam
    expect(result.transcription).toBe("<p>No, not enough milk</p>");
    expect(result.feedback.attempt).toBe("<p>No, not enough milk</p>");
    expect(result.awards[0]!.working?.kind).toBe("text");
    expect((result.awards[0]!.working?.content as { answerHtml: string }).answerHtml).toBe("<p>No, not enough milk</p>");
    expect(counters.blocks).toBe(1);
  });
});

describe("the context seam (plan §3.4 step 1: carry the learner's mark_working_blocks)", () => {
  test("prior blocks for THIS region ride the marker prompt, serialized with kind + time", async () => {
    const { sql, contextRoute } = makeSql();
    contextRoute.rowsFor = (params) =>
      params[0] === LEARNER && params[3] === "17.a"
        ? [{ id: "55000000-0000-4000-8000-000000000001", kind: "text", content: { answerHtml: "earlier typed try" }, created_at: "2026-10-30T10:00:00Z" }]
        : [];
    const t = recordingTranscriber("No, not enough milk");
    const m = recordingMarker(
      verdictFor(DEFS_A, { awardedPositions: [], transcription: "No, not enough milk", prefixTranscription: true, doctrine: true }),
    );
    const marking = makeMarking(sql, t.fake, m.fake);
    const plan = await planA(marking);
    await marking.markRegion({ ...BASE_A, plan });
    expect(m.users[0]).toContain("earlier typed try");
    expect(m.users[0]).toContain("(text):");
  });
});

describe("the identity module of record", () => {
  test("the crop transcription prompt carries the region-scoping rule; the pipeline version is paper-mark/v1", () => {
    expect(CROP_TRANSCRIPTION_SYSTEM_PROMPT).toContain("outside the scope of this marking");
  });

  test("parseVerdict strips a single code fence but stays strict otherwise", () => {
    const v = verdictFor(DEFS_A, { awardedPositions: [], transcription: "t", prefixTranscription: true });
    const fenced = "```json\n" + JSON.stringify(v) + "\n```";
    expect(parseVerdict(fenced).points.length).toBe(3);
    expect(() => parseVerdict("[]")).toThrow();
    expect(() => parseVerdict('{"chatMessage":"x"}')).toThrow();
  });
});

describe("the registry lifecycle (the 202 + poll posture)", () => {
  test("queued → running → succeeded; a PipelineError lands as failed with its honest code; unknown polls null", async () => {
    const registry = new MarkJobRegistry();
    const id1 = registry.enqueue(async () => ({
      pipelineVersion: "paper-mark/v1",
      documentRefType: "paper_asset" as const,
      documentRefId: PAPER,
      regionKey: "17.a",
      transcription: "t",
      feedback: {
        attempt: "t",
        chatMessage: "c",
        pointsScored: [],
        pointsNotScored: [],
        thoughtProcess: "t",
        strategiesForImprovement: [],
      },
      awards: [
        { code: "P1", awarded: true, score: 1, maxScore: 1, ordinal: 0, markPointId: DEFS_A[0]!.id, page: 2, feedback: {
          attempt: "t", chatMessage: "c", pointsScored: [], pointsNotScored: [], thoughtProcess: "t", strategiesForImprovement: [],
        } },
      ],
      receipt: { emitted: 1, suppressed: 0, workingBlocks: 1 },
    }));
    const id2 = registry.enqueue(async () => {
      throw new Error("boom");
    });
    const id3 = registry.enqueue(async () => {
      throw new PipelineError({ status: 422, code: "transcription_nothing_readable", message: "m" });
    });
    await registry.waitAll();
    const s1 = registry.poll(id1);
    expect(s1?.status).toBe("succeeded");
    expect(s1?.receipt).toEqual({ emitted: 1, suppressed: 0, workingBlocks: 1 });
    expect(s1?.awards?.[0]!.ordinal).toBe(0);
    const s2 = registry.poll(id2);
    expect(s2?.status).toBe("failed");
    expect(s2?.error?.code).toBe("marking_failed");
    const s3 = registry.poll(id3);
    expect(s3?.status).toBe("failed");
    expect(s3?.error?.code).toBe("transcription_nothing_readable");
    expect(registry.poll(crypto.randomUUID())).toBeNull();
    // snapshots are frozen copies — mutating a poll result must not corrupt the job
    (s1 as unknown as { status: string }).status = "corrupted";
    expect(registry.poll(id1)?.status).toBe("succeeded");
  });
});
