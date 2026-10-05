/**
 * T-MIG-020 tranche-2 unit tests — the teacher content-review QUEUE surfaces
 * (v1 / v2 enrichment / v3 signals), stubbed-sql (no Neon).
 *
 * The stub dispatches on the rendered query text (+ optional param
 * discriminator) so every test also PINS the SQL shape or the call sequence
 * its port issues — ordering legs, aggregate groupings and the per-paper
 * bridge lookup are load-bearing parity, not implementation detail.
 */
import { describe, expect, test } from "bun:test";
import { buildContentModule, compareUuid } from "../../src/services/content";
import { fakeSql, type Route } from "./helpers";

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const PV = "00000000-0000-4000-8000-0000000000b1";
const T1 = "00000000-0000-4000-8000-0000000000011";
const T2 = "00000000-0000-4000-8000-0000000000012";
const T3 = "00000000-0000-4000-8000-0000000000013";

const paper = (id: string, createdAt: string) => ({
  id,
  subject_id: "00000000-0000-4000-8000-0000000000s1",
  title: `paper-${id.slice(-2)}`,
  board: "Edexcel",
  qualification: "GCSE",
  unit: null,
  session_label: "June 2024",
  paper_code: `4CH1/${id.slice(-2)}`,
  question_paper_document_id: `qp-${id.slice(-2)}`,
  mark_scheme_document_id: `ms-${id.slice(-2)}`,
  validation_state: "SUGGESTED",
  provenance: "PAST_PAPER",
  extraction_method: "glm-ocr-v1",
  created_by: null,
  created_at: createdAt,
});

const routesV2 = (opts: {
  papers: Array<Record<string, unknown>>;
  versionCensus: Array<Record<string, unknown>>;
  schemeCensus: Array<Record<string, unknown>>;
  confidence: Array<Record<string, unknown>>;
  bridges: Record<string, Array<Record<string, unknown>>>;
}): Route[] => [
  {
    match: /select \* from exam_papers where validation_state = 'SUGGESTED' order by created_at desc/i,
    rows: opts.papers,
  },
  {
    match: /select q\.exam_paper_id, v\.validation_state, count\(\*\) as cnt/i,
    rows: opts.versionCensus,
  },
  {
    match: /select q\.exam_paper_id, s\.validation_state, count\(\*\) as cnt/i,
    rows: opts.schemeCensus,
  },
  {
    match: /avg\(v\.extraction_confidence\) as avg_conf/i,
    rows: opts.confidence,
  },
  ...Object.entries(opts.bridges).map(([pid, rows]) => ({
    match: /select \* from glm_ocr_bridge_records where paper_id = \?$/i,
    matchParams: (params: unknown[]) => params[0] === pid,
    rows,
  })),
  // catch-all: every SUGGESTED paper triggers one bridge lookup; papers
  // without a stubbed entry simply have no bridge row (null)
  { match: /select \* from glm_ocr_bridge_records where paper_id = \?$/i, rows: [] },
];

const bridge = (paperId: string, findings: string, status = "OK") => ({
  id: "00000000-0000-4000-8000-0000000000f0",
  paper_id: paperId,
  bridge: "glm-ocr-v1",
  qp_document_id: "qp-x",
  ms_document_id: "ms-x",
  qp_document_row_id: null,
  ms_document_row_id: null,
  qp_checksum: "c1",
  ms_checksum: "c2",
  extraction_methods: "glm-ocr-v1",
  reconciliation_status: status,
  review_findings: findings,
  qp_draft: "{}",
  ms_draft: "{}",
  reconciliation: "{}",
  created_by: null,
  created_at: "2026-10-04T10:00:00Z",
});

describe("reviewQueue v1 — the controller's exact three calls", () => {
  test("seed/empty state pins the captured golden body", async () => {
    const sql = fakeSql([
      { match: /from exam_papers\s*where validation_state = 'SUGGESTED'/i, rows: [] },
      { match: /from question_versions\s*where validation_state = 'SUGGESTED'/i, rows: [] },
      { match: /from mark_schemes\s*where validation_state = 'SUGGESTED'/i, rows: [] },
    ]);
    const { review } = buildContentModule(sql);
    expect(await review.reviewQueue()).toEqual({
      papers: [],
      suggestedVersions: 0,
      suggestedSchemes: 0,
    });
    // three full findSuggested queries, NOT count(*) shortcuts (R-LAZY)
    expect(sql.queries).toHaveLength(3);
  });

  test("populated queue maps PaperSummary verbatim and counts rows", async () => {
    const sql = fakeSql([
      {
        match: /from exam_papers\s*where validation_state = 'SUGGESTED'/i,
        rows: [paper(P1, "2026-10-04T19:02:13Z")],
      },
      {
        match: /from question_versions\s*where validation_state = 'SUGGESTED'/i,
        rows: [{ id: "v1" }, { id: "v2" }],
      },
      {
        match: /from mark_schemes\s*where validation_state = 'SUGGESTED'/i,
        rows: [{ id: "s1" }],
      },
    ]);
    const { review } = buildContentModule(sql);
    const view = await review.reviewQueue();
    expect(view.suggestedVersions).toBe(2);
    expect(view.suggestedSchemes).toBe(1);
    expect(view.papers).toEqual([
      {
        id: P1,
        subjectId: "00000000-0000-4000-8000-0000000000s1",
        title: "paper-a1",
        paperCode: "4CH1/a1",
        sessionLabel: "June 2024",
        board: "Edexcel",
        qualification: "GCSE",
        validationState: "SUGGESTED",
      },
    ]);
  });
});

describe("enrichedReviewQueue v2 — baseEnrichment math + ordering", () => {
  test("empty state pins the captured golden body", async () => {
    const sql = fakeSql([
      ...routesV2({
        papers: [],
        versionCensus: [],
        schemeCensus: [],
        confidence: [],
        bridges: {},
      }),
      { match: /select \* from exam_papers where validation_state = 'VALIDATED'/i, rows: [] },
      { match: /from questions q\s*where q\.exam_paper_id = any/i, rows: [] },
      { match: /select q\.exam_paper_id, qt\.node_id/i, rows: [] },
    ]);
    const { review } = buildContentModule(sql);
    expect(await review.enrichedReviewQueue()).toEqual({
      papers: [],
      suggestedVersions: 0,
      suggestedSchemes: 0,
    });
  });

  test("per-paper enrichment: census sums, bridge findingCount, confidence", async () => {
    const sql = fakeSql(
      routesV2({
        papers: [paper(P1, "2026-10-04T19:02:13Z")],
        versionCensus: [
          { exam_paper_id: P1, validation_state: "SUGGESTED", cnt: "3" },
          { exam_paper_id: P1, validation_state: "VALIDATED", cnt: "1" },
        ],
        schemeCensus: [{ exam_paper_id: P1, validation_state: "SUGGESTED", cnt: "1" }],
        confidence: [{ exam_paper_id: P1, avg_conf: "0.87" }],
        bridges: {
          // two '"source"' occurrences → split length 3 − 1 = 2
          [P1]: [bridge(P1, '{"findings":[{"source":"a"},{"source":"b"}]}')],
        },
      }),
    );
    const { review } = buildContentModule(sql);
    const view = await review.enrichedReviewQueue();
    expect(view.papers).toHaveLength(1);
    const p = view.papers[0]!;
    expect(p.versionCount).toBe(4);
    expect(p.validatedVersions).toBe(1);
    expect(p.rejectedVersions).toBe(0);
    expect(p.flaggedVersions).toBe(0);
    expect(p.suggestedSchemes).toBe(1);
    expect(p.reconciliationStatus).toBe("OK");
    expect(p.findingCount).toBe(2);
    expect(p.avgExtractionConfidence).toBe(0.87);
    expect(p.createdAt).toBe("2026-10-04T19:02:13.000Z");
    // suggestedVersions = Σ(versionCount − validated − rejected − flagged)
    expect(view.suggestedVersions).toBe(3);
    expect(view.suggestedSchemes).toBe(1);
    // the bridge lookup is a PER-PAPER call (application-issued sequence)
    expect(sql.queries.filter((q) => q.includes("glm_ocr_bridge_records"))).toHaveLength(1);
  });

  test("no bridge row → reconciliationStatus null, findingCount 0", async () => {
    const sql = fakeSql(
      routesV2({
        papers: [paper(P1, "2026-10-04T19:02:13Z")],
        versionCensus: [],
        schemeCensus: [],
        confidence: [],
        bridges: { [P1]: [] },
      }),
    );
    const { review } = buildContentModule(sql);
    const p = (await review.enrichedReviewQueue()).papers[0]!;
    expect(p.reconciliationStatus).toBeNull();
    expect(p.findingCount).toBe(0);
    expect(p.avgExtractionConfidence).toBeNull();
  });

  test("ordering: reconciled-OK first, then confidence desc, findings asc, newest", async () => {
    const older = paper(P1, "2026-10-04T10:00:00Z");
    const newer = paper(P2, "2026-10-04T20:00:00Z");
    const sql = fakeSql(
      routesV2({
        papers: [older, newer], // findSuggested order (newest first)
        versionCensus: [],
        schemeCensus: [],
        confidence: [{ exam_paper_id: P1, avg_conf: "0.50" }],
        bridges: { [P1]: [bridge(P1, "{}")] }, // P1 OK + findings 0
      }),
    );
    const { review } = buildContentModule(sql);
    const ids = (await review.enrichedReviewQueue()).papers.map((p) => p.id);
    // P1: OK → first despite older createdAt
    expect(ids).toEqual([P1, P2]);
  });
});

describe("enrichedReviewQueueV3 — §7 signals, rank reasons, tie-breaks", () => {
  const v3routes = (opts: {
    papers: Array<Record<string, unknown>>;
    validated: Array<Record<string, unknown>>;
    primaryTopics: Array<Record<string, unknown>>;
    mappings: Array<Record<string, unknown>>;
    census: Array<Record<string, unknown>>;
    schemeLinks: Array<Record<string, unknown>>;
    versionCensus?: Array<Record<string, unknown>>;
    schemeCensus?: Array<Record<string, unknown>>;
    confidence?: Array<Record<string, unknown>>;
    bridges?: Record<string, Array<Record<string, unknown>>>;
  }): Route[] => [
    {
      match: /select \* from exam_papers where validation_state = 'SUGGESTED' order by created_at desc/i,
      rows: opts.papers,
    },
    {
      match: /select \* from exam_papers where validation_state = 'VALIDATED' order by created_at desc/i,
      rows: opts.validated,
    },
    {
      match: /select distinct q\.primary_topic_node_id/i,
      rows: opts.primaryTopics,
    },
    {
      match: /select q\.exam_paper_id, qt\.node_id/i,
      rows: opts.mappings,
    },
    {
      match: /sum\(case when exists/i,
      rows: opts.census,
    },
    {
      match: /count\(distinct q\.id\) as cnt/i,
      rows: opts.schemeLinks,
    },
    ...routesV2({
      papers: [],
      versionCensus: opts.versionCensus ?? [],
      schemeCensus: opts.schemeCensus ?? [],
      confidence: opts.confidence ?? [],
      bridges: opts.bridges ?? {},
    }),
  ];

  test("empty state pins the captured golden body incl. practicableTopicCount", async () => {
    const sql = fakeSql(
      v3routes({
        papers: [],
        validated: [],
        primaryTopics: [],
        mappings: [],
        census: [],
        schemeLinks: [],
      }),
    );
    const { review } = buildContentModule(sql);
    expect(await review.enrichedReviewQueueV3()).toEqual({
      papers: [],
      suggestedVersions: 0,
      suggestedSchemes: 0,
      practicableTopicCount: 0,
    });
  });

  test("rank reasons carry only the signals that hold, in priority order", async () => {
    const sql = fakeSql(
      v3routes({
        papers: [paper(P1, "2026-10-04T19:02:13Z")],
        validated: [],
        primaryTopics: [],
        mappings: [{ exam_paper_id: P1, node_id: T1 }],
        census: [{ exam_paper_id: P1, total: "2", mapped: "1" }],
        schemeLinks: [{ exam_paper_id: P1, cnt: "1" }],
        versionCensus: [{ exam_paper_id: P1, validation_state: "SUGGESTED", cnt: "3" }],
        confidence: [{ exam_paper_id: P1, avg_conf: "0.87" }],
        bridges: { [P1]: [bridge(P1, '{"findings":[{"source":"a"}]}')] },
      }),
    );
    const { review } = buildContentModule(sql);
    const view = await review.enrichedReviewQueueV3();
    expect(view.practicableTopicCount).toBe(0); // no VALIDATED papers
    const p = view.papers[0]!;
    expect(p.totalQuestions).toBe(2);
    expect(p.mappedQuestions).toBe(1);
    expect(p.questionsWithScheme).toBe(1);
    expect(p.novelTopicCount).toBe(1); // T1 not practicable yet
    expect(p.rankReasons).toEqual([
      "bridge reconciled OK",
      "mark scheme linked for 1/2 question(s)",
      "1/2 question(s) mapped to curriculum",
      "brings 1 topic(s) not yet practicable from validated content",
      "mean extraction confidence 0.87",
    ]);
  });

  test("practicable set = validated primary topics ∪ validated mapped topics", async () => {
    const sql = fakeSql(
      v3routes({
        papers: [paper(P1, "2026-10-04T19:02:13Z")],
        validated: [{ ...paper(PV, "2026-10-04T09:00:00Z"), validation_state: "VALIDATED" }],
        primaryTopics: [{ primary_topic_node_id: T2 }],
        mappings: [
          { exam_paper_id: P1, node_id: T1 },
          { exam_paper_id: PV, node_id: T2 },
          { exam_paper_id: PV, node_id: T3 },
        ],
        census: [{ exam_paper_id: P1, total: "2", mapped: "1" }],
        schemeLinks: [],
      }),
    );
    const { review } = buildContentModule(sql);
    const view = await review.enrichedReviewQueueV3();
    // practicable = {T2 (primary of validated), T2, T3 (mapped of validated)}
    expect(view.practicableTopicCount).toBe(2);
    const p = view.papers[0]!;
    // T1 is P1's only mapped topic; T3/T2 practicable → novel = {T1} − {T2,T3} = 1
    expect(p.novelTopicCount).toBe(1);
    expect(p.rankReasons).toContain(
      "brings 1 topic(s) not yet practicable from validated content",
    );
  });

  test("scheme/mapping ratios order the queue; full ties break by Java UUID order", async () => {
    const fullyLinked = paper(P1, "2026-10-04T19:00:00Z");
    const halfLinked = paper(P2, "2026-10-04T19:01:00Z");
    // PA/PB: identical signals on every leg — tie-break must follow the
    // SIGNED msb comparison (8000… is NEGATIVE, 7fff… POSITIVE), so the
    // 8000 id sorts FIRST — string order would say the opposite.
    const pa = {
      ...paper("80000000-0000-4000-8000-0000000000a1", "2026-10-04T19:02:00Z"),
    };
    const pb = {
      ...paper("7fffffff-0000-4000-8000-0000000000a2", "2026-10-04T19:02:00Z"),
    };
    const sql = fakeSql(
      v3routes({
        papers: [pa, pb, fullyLinked, halfLinked],
        validated: [],
        primaryTopics: [],
        mappings: [],
        census: [
          { exam_paper_id: P1, total: "2", mapped: "2" },
          { exam_paper_id: P2, total: "2", mapped: "0" },
          { exam_paper_id: pa.id, total: "0", mapped: "0" },
          { exam_paper_id: pb.id, total: "0", mapped: "0" },
        ],
        schemeLinks: [
          { exam_paper_id: P1, cnt: "2" },
          { exam_paper_id: P2, cnt: "0" },
        ],
      }),
    );
    const { review } = buildContentModule(sql);
    const ids = (await review.enrichedReviewQueueV3()).papers.map((p) => p.id);
    // P1 (ratio 1.0) > P2 (0.0) > pa/pb (no questions → -1.0, tie → the
    // NEGATIVE msb (8000…) sorts FIRST under the signed comparison)
    expect(ids).toEqual([P1, P2, pa.id, pb.id]);
  });

  test("compareUuid ports the signed msb/lsb halves of java.util.UUID", () => {
    // 0x7fff… > 0x8000… (positive beats negative) — string compare would invert
    expect(compareUuid("7fffffff-0000-4000-8000-00000000000a", "80000000-0000-4000-8000-00000000000b")).toBe(1);
    expect(compareUuid("80000000-0000-4000-8000-00000000000b", "7fffffff-0000-4000-8000-00000000000a")).toBe(-1);
    expect(compareUuid("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a1")).toBe(0);
    // same msb → lsb decides
    expect(compareUuid("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2")).toBe(-1);
  });
});
