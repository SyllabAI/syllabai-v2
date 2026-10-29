/**
 * PaperAwards service tests (T-MG-AWARDS-1 run-001) — the §3.2 acceptance
 * pins over REAL services on stubbed sql (the 032 pattern):
 *   (a) ledger pin — one region, three award rows (P1/P1/C1): score = Σ
 *       awarded, ordinal disambiguates the duplicate codes, maxScore = Σ
 *       max_score;
 *   (b) evidence pin — an award with workingRef resolves to its working
 *       block in the same region slice;
 *   (c) event pin — an award write emits exactly one ledger row through
 *       the DC-7 claim (the createGradedEvidencePublisher integration
 *       pattern: won claim → writes in the zero-orphan order; re-fire →
 *       suppressed, ZERO rows); plus the region-key bridge laws (the
 *       RECT-1 derive: external_ref / q{n} positional fallback; labeled
 *       "6.a" vs answer-line "9.p1"; unknown region 404).
 */
import { describe, expect, test } from "bun:test";
import {
  PaperAwards,
  createPaperAwardPublisher,
  frozenParityPaperAwardPublisher,
  type PaperAwardEvent,
  type PaperAwardPublisher,
} from "../../src/services/paper-awards";
import type { SqlFn } from "../../src/services/paper-awards/sql";

type Route = {
  match: RegExp;
  rows?: Array<Record<string, unknown>>;
  rowsFor?: (params: unknown[]) => Array<Record<string, unknown>>;
};

const LEARNER = "aa645313-5930-4381-91ed-caff67a2f836";
const LEARNER2 = "aa645313-5930-4381-91ed-caff67a2f999";
const PAPER = "47000000-0000-4000-8000-000000000001";
const PART = "51000000-0000-4000-8000-000000000001";
const QUESTION = "52000000-0000-4000-8000-000000000001";
const POINT = "53000000-0000-4000-8000-000000000001";
const AWARD_P1_0 = "54000000-0000-4000-8000-000000000001";
const AWARD_P1_1 = "54000000-0000-4000-8000-000000000002";
const AWARD_C1 = "54000000-0000-4000-8000-000000000003";
const BLOCK = "55000000-0000-4000-8000-000000000001";
const UNKNOWN = "56000000-0000-4000-8000-000000000099";

const fb = (msg: string) => ({
  attempt: "full",
  chatMessage: msg,
  pointsScored: [],
  pointsNotScored: [],
  thoughtProcess: "dry-run thought process",
  strategiesForImprovement: [],
});

/** The three-award P1/P1/C1 region (pin a shape) with the working pointer
 * on the first P1 (pin b shape). */
const ledgerRows: Array<Record<string, unknown>> = [
  {
    id: AWARD_P1_0, region_key: "9", page: 2, code: "P1", awarded: true, score: 1, max_score: 1,
    ordinal: 0, mark_point_id: POINT, working_ref: BLOCK, pipeline_version: "paper-mark/v1-dryrun",
    feedback: fb("process point earned"), created_at: "2026-10-30T00:00:00Z",
    wb_id: BLOCK, wb_kind: "text", wb_content: { transcript: "180 - 125 = 55" }, wb_created_at: "2026-10-30T00:00:00Z",
  },
  {
    id: AWARD_P1_1, region_key: "9", page: 2, code: "P1", awarded: true, score: 1, max_score: 1,
    ordinal: 1, mark_point_id: POINT, working_ref: null, pipeline_version: "paper-mark/v1-dryrun",
    feedback: fb("second process point"), created_at: "2026-10-30T00:00:01Z",
    wb_id: null, wb_kind: null, wb_content: null, wb_created_at: null,
  },
  {
    id: AWARD_C1, region_key: "9", page: 2, code: "C1", awarded: false, score: 0, max_score: 1,
    ordinal: 0, mark_point_id: POINT, working_ref: null, pipeline_version: "paper-mark/v1-dryrun",
    feedback: fb("answer not stated"), created_at: "2026-10-30T00:00:02Z",
    wb_id: null, wb_kind: null, wb_content: null, wb_created_at: null,
  },
];

const ledgerRoute: Route = {
  match: /from mark_awards a left join mark_working_blocks/,
  rows: [],
  rowsFor: (params) => {
    // [learnerId, documentRefType, documentRefId]
    if (params[0] === LEARNER && params[2] === PAPER) return ledgerRows;
    return []; // learner scoping: another learner sees an EMPTY ledger
  },
};

const partRoute: Route = {
  match: /from question_parts p join question_versions v/,
  rows: [],
  rowsFor: (params) =>
    params[0] === PART
      ? [{ part_id: PART, label: "a", ordering: 0, question_id: QUESTION }]
      : [],
};

const questionRoute: Route = {
  match: /from questions q where q\.id = \?/,
  rows: [],
  rowsFor: (params) =>
    params[0] === QUESTION
      ? [{ question_id: QUESTION, external_ref: "9", exam_paper_id: PAPER }]
      : [],
};

function makeSql(extra: Route[] = [], issued?: string[]) {
  const all = [...extra, ledgerRoute, partRoute, questionRoute];
  return (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
    issued?.push(text);
    const hit = all.find((r) => r.match.test(text));
    if (!hit) throw new Error("unexpected query: " + text);
    return hit.rowsFor ? hit.rowsFor(params) : hit.rows;
  }) as unknown as SqlFn;
}

describe("T-MG-AWARDS-1 run-001 — the §3.2 acceptance pins", () => {
  test("(a) ledger pin — one region, three award rows: score = Σ awarded, ordinal disambiguates the duplicate P1, maxScore = Σ max_score", async () => {
    const awards = new PaperAwards(makeSql(), frozenParityPaperAwardPublisher);
    const ledger = await awards.ledger(LEARNER, "paper_asset", PAPER);
    expect(ledger.documentRefType).toBe("paper_asset");
    expect(ledger.documentRefId).toBe(PAPER);
    expect(ledger.regions).toHaveLength(1);
    const region = ledger.regions[0]!;
    expect(region.regionKey).toBe("9");
    expect(region.score).toBe(2); // Σ awarded (the C1 carries 0)
    expect(region.maxScore).toBe(3); // Σ max_score
    expect(region.awards).toHaveLength(3);
    // ordinal disambiguates the duplicate code (position law)
    const p1s = region.awards.filter((a) => a.code === "P1");
    expect(p1s.map((a) => a.ordinal).sort()).toEqual([0, 1]);
    expect(new Set(p1s.map((a) => a.id)).size).toBe(2); // per-award ids — the parity headline
    // the non-awarded C1 serves score 0 (the write-side score law)
    const c1 = region.awards.find((a) => a.code === "C1")!;
    expect(c1.awarded).toBe(false);
    expect(c1.score).toBe(0);
  });

  test("(b) evidence pin — an award with workingRef resolves to its working block in the same region slice", async () => {
    const awards = new PaperAwards(makeSql(), frozenParityPaperAwardPublisher);
    const ledger = await awards.ledger(LEARNER, "paper_asset", PAPER);
    const region = ledger.regions[0]!;
    const withWorking = region.awards.find((a) => a.workingRef !== null)!;
    expect(withWorking.workingRef).toBe(BLOCK);
    expect(region.workingBlocks).toHaveLength(1);
    expect(region.workingBlocks[0]!.id).toBe(BLOCK);
    expect(region.workingBlocks[0]!.kind).toBe("text");
    expect(region.workingBlocks[0]!.content).toEqual({ transcript: "180 - 125 = 55" });
  });

  test("learner scoping — the ledger is the CALLING learner's only (the JWT posture, never a wire param)", async () => {
    const awards = new PaperAwards(makeSql(), frozenParityPaperAwardPublisher);
    const ledger = await awards.ledger(LEARNER2, "paper_asset", PAPER);
    expect(ledger.regions).toEqual([]); // honest-empty, 200 — never another learner's rows
  });

  test("(c) event pin — the DC-7 claim: a won claim emits exactly one row (award first, then the zero-orphan working block); a re-fire is suppressed with ZERO rows", async () => {
    const issued: string[] = [];
    const event: PaperAwardEvent = {
      learnerId: LEARNER,
      documentRefType: "paper_asset",
      documentRefId: PAPER,
      regionKey: "9",
      page: 2,
      markPointId: POINT,
      code: "P1",
      awarded: true,
      score: 1,
      maxScore: 1,
      ordinal: 0,
      pipelineVersion: "paper-mark/v1",
      feedback: fb("claim test"),
      working: { kind: "text", content: { transcript: "180 - 125 = 55" } },
    };
    // real claim simulation over the ACTUAL conflict target:
    // (learner, document_ref_id, region_key, code, ordinal)
    const claimed = new Set<string>();
    const claimSql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = strings.join(" ? ").replace(/\s+/g, " ").trim();
      issued.push(text);
      if (/insert into mark_awards/.test(text)) {
        // params: 0=learnerId 2=refId 3=regionKey 6=code 10=ordinal
        const key = [params[0], params[2], params[3], params[6], params[10]].join("|");
        if (claimed.has(key)) return [];
        claimed.add(key);
        return [{ id: "54000000-0000-4000-8000-000000009999" }];
      }
      if (/insert into mark_working_blocks/.test(text)) return [{ id: "55000000-0000-4000-8000-000000009999" }];
      throw new Error("unexpected query: " + text);
    }) as unknown as SqlFn;
    const live = createPaperAwardPublisher(claimSql);

    expect(await live.publishAward(event)).toBe(true); // claim WON — emitted
    const awardWrites = issued.filter((t) => /insert into mark_awards/.test(t)).length;
    const blockWrites = issued.filter((t) => /insert into mark_working_blocks/.test(t)).length;
    expect(awardWrites).toBe(1);
    expect(blockWrites).toBe(1); // the working block rides the won claim
    // the zero-orphan law: the claimed row CARRIES workingRef before the
    // block insert (the pointer is on the claim itself)
    expect(issued.find((t) => /insert into mark_awards/.test(t))).toContain("working_ref");

    expect(await live.publishAward(event)).toBe(false); // re-fire SUPPRESSED
    // the claim re-issues (the claim IS the insert) but the conflict target
    // absorbs it — ZERO rows written; and NO orphan working block
    expect(issued.filter((t) => /insert into mark_awards/.test(t)).length).toBe(awardWrites + 1);
    expect(issued.filter((t) => /insert into mark_working_blocks/.test(t)).length).toBe(blockWrites);

    // the seam double keeps its documented posture (claims true, emits nothing)
    expect(await frozenParityPaperAwardPublisher.publishAward(event)).toBe(true);
  });

  test("free-form region path — markPointId nullable (no definition join), served null", async () => {
    const rows = ledgerRows.map((r) => ({ ...r, mark_point_id: null }));
    // override with a fixed-learner route serving the null-pointer rows
    const fixed: Route = { match: ledgerRoute.match, rowsFor: (params) => (params[0] === LEARNER && params[2] === PAPER ? rows : []) };
    const awards = new PaperAwards(makeSql([fixed]), frozenParityPaperAwardPublisher);
    const ledger = await awards.ledger(LEARNER, "paper_asset", PAPER);
    expect(ledger.regions[0]!.awards.every((a) => a.markPointId === null)).toBe(true);
  });
});

describe("T-MG-AWARDS-1 run-001 — the POST region-key bridge (the RECT-1 derive law)", () => {
  test("part region: labeled sub-part derives '9.a'; external_ref question key; documentRef = the owning paper", async () => {
    const awards = new PaperAwards(makeSql(), frozenParityPaperAwardPublisher);
    const resolved = await awards.resolveRegion(PART);
    expect(resolved).toEqual({
      documentRefType: "paper_asset",
      documentRefId: PAPER,
      regionKey: "9.a", // labeled part law: /^[a-z]/i → questionKey + "." + label
      questionPartId: PART,
    });
  });

  test("answer-line part: label not letter-leading derives '9.p{ordering+1}'", async () => {
    const answerLine: Route = {
      match: partRoute.match,
      rowsFor: (params) => (params[0] === PART ? [{ part_id: PART, label: "1", ordering: 0, question_id: QUESTION }] : []),
    };
    const awards = new PaperAwards(makeSql([answerLine]), frozenParityPaperAwardPublisher);
    const resolved = await awards.resolveRegion(PART);
    expect(resolved.regionKey).toBe("9.p1"); // 1-based answer-line convention
  });

  test("question region: regionId is a questions.id → regionKey = external_ref, questionPartId null", async () => {
    const awards = new PaperAwards(makeSql(), frozenParityPaperAwardPublisher);
    const resolved = await awards.resolveRegion(QUESTION);
    expect(resolved).toEqual({
      documentRefType: "paper_asset",
      documentRefId: PAPER,
      regionKey: "9",
      questionPartId: null,
    });
  });

  test("q{n} positional fallback: null external_ref → the 1-based position under the RECT-1 ordering", async () => {
    const noRef: Route = {
      match: questionRoute.match,
      rowsFor: (params) => (params[0] === QUESTION ? [{ question_id: QUESTION, external_ref: null, exam_paper_id: PAPER }] : []),
    };
    const position: Route = {
      match: /row_number\(\) over/,
      rowsFor: () => [{ position: "7" }],
    };
    const awards = new PaperAwards(makeSql([noRef, position]), frozenParityPaperAwardPublisher);
    const resolved = await awards.resolveRegion(QUESTION);
    expect(resolved.regionKey).toBe("q7");
  });

  test("unknown region → 404 (the T-C20 envelope, 'region {uuid} not found')", async () => {
    const awards = new PaperAwards(makeSql(), frozenParityPaperAwardPublisher);
    await expect(awards.resolveRegion(UNKNOWN)).rejects.toThrow("region " + UNKNOWN + " not found");
  });

  test("recordRegionAwards — the claim receipt aggregates emitted/suppressed/workingBlocks (the Phase 4 write shape)", async () => {
    const published: PaperAwardEvent[] = [];
    const spy: PaperAwardPublisher = {
      publishAward: async (event) => {
        published.push(event);
        return event.ordinal > 0; // ordinal 0 suppressed, 1 emitted
      },
    };
    const awards = new PaperAwards(makeSql(), spy);
    const receipt = await awards.recordRegionAwards({
      learnerId: LEARNER,
      resolution: { documentRefType: "paper_asset", documentRefId: PAPER, regionKey: "9", questionPartId: PART },
      pipelineVersion: "paper-mark/v1",
      awards: [
        { code: "P1", awarded: true, score: 1, maxScore: 1, ordinal: 0, feedback: fb("x"), working: { kind: "ink", content: {} } },
        { code: "P1", awarded: true, score: 1, maxScore: 1, ordinal: 1, feedback: fb("y") },
      ],
    });
    expect(receipt).toEqual({
      documentRefType: "paper_asset",
      documentRefId: PAPER,
      regionKey: "9",
      emitted: 1,
      suppressed: 1,
      workingBlocks: 0, // the working payload rode the SUPPRESSED claim — no block
    });
    expect(published).toHaveLength(2);
    expect(published[0]!.learnerId).toBe(LEARNER); // the JWT learner rides the event
    expect(published[0]!.markPointId).toBeNull(); // free-form null path
  });
});
