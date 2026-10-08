/**
 * T-MIG-107 — the content-write surfaces port (the §7 validation workflow).
 * Two tiers over NO database (the T-MIG-020 content-test doctrine):
 *
 *   Tier 1 — the REAL ContentReviewWriteService over a fakeSql stub
 *   (route-dispatched canned rows, the assessment/curriculum helpers
 *   pattern): state machines, guard messages, guard order, audit rows,
 *   the transaction boundary (every mutation runs inside sql.transaction).
 *
 *   Tier 2 — the route-level wire contract over createTeacherContentRouter
 *   with the writes handle faked: status codes + bodies incl. the 088
 *   leg-08/09 golden pins (404 question law / 400 primaryNodeId law), the
 *   Bean-Validation laws, the Jackson body-binding laws, the opaque-500
 *   IllegalState mapping, the 201 views.
 *
 * Frozen law: syllabai-core @ 6cad6ef — teacher/ContentReviewService.java
 * write methods + teacher/ContentAuditRecorder.java + the assessment
 * entity flag/unflag guards + GlobalExceptionHandler mapping.
 */
import { describe, expect, test } from "bun:test";
import { Hono, type Context } from "hono";
import { createTeacherContentRouter } from "../../src/routes/content";
import type { ContentReadApp } from "../../src/services/content";
import {
  ContentReviewWriteService,
  actorLabelOf,
  assertFlaggable,
  assertUnflaggable,
  type TxSqlFn,
  type ReviewActor,
} from "../../src/services/content/review-writes";
import { fakeSql, type Route } from "../assessment/helpers";
import {
  ConflictException,
  NotFoundException,
} from "../../src/services/identity/errors";
import { InvalidDocumentError } from "../../src/services/ingestion/canonical";

const PAPER_ID = "60000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "70000000-0000-4000-8000-000000000001";
const SUBJECT2_ID = "70000000-0000-4000-8000-000000000002";
const VERSION_ID = "61000000-0000-4000-8000-000000000001";
const QUESTION_ID = "62000000-0000-4000-8000-000000000001";
const SCHEME_ID = "63000000-0000-4000-8000-000000000001";
const POINT_ID = "64000000-0000-4000-8000-000000000001";
const NODE_ID = "20000000-0000-4000-8000-000000000012";
const NODE2_ID = "20000000-0000-4000-8000-000000000013";
const UNKNOWN = "00000000-0000-4000-8000-0000000000d1";

const TEACHER: ReviewActor = { userId: "u-teacher", email: "t@syllab.ai" };

const PAPER_ROW = {
  id: PAPER_ID,
  subject_id: SUBJECT_ID,
  title: "June 2014 Paper 1",
  paper_code: "9706/11",
  session_label: "June 2014",
  board: "CIE",
  qualification: "A Level",
  validation_state: "SUGGESTED",
};

const VERSION_ROW = {
  id: VERSION_ID,
  question_id: QUESTION_ID,
  version: 1,
  validation_state: "SUGGESTED",
};

const SCHEME_ROW = {
  id: SCHEME_ID,
  question_version_id: VERSION_ID,
  validation_state: "SUGGESTED",
};

const NODE_ROW = { id: NODE_ID, code: "3.1.1", title: "Esters" };

// ── Tier 1: the real service over fakeSql ───────────────────────────────────

function txFakeSql(routes: Route[]): TxSqlFn & { calls: Array<{ text: string; params: unknown[] }> } {
  const inner = fakeSql(routes);
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const wrapped = async (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({
      text: strings.join(" ? ").replace(/\s+/g, " ").trim(),
      params,
    });
    return inner(strings, ...params);
  };
  const tx = Object.assign(wrapped, {
    transaction: async <T,>(body: (t: unknown) => Promise<T>) =>
      body(wrapped as unknown as (strings: TemplateStringsArray, ...params: unknown[]) => Promise<Array<Record<string, unknown>>>),
    calls,
    // the fakeSql instance's live issued-query log (whitespace-collapsed text)
    queries: (inner as unknown as { queries: string[] }).queries,
  });
  return tx as unknown as TxSqlFn & { calls: Array<{ text: string; params: unknown[] }> };
}

/** the issued-query log off the fakeSql instance */
function queriesOf(tx: TxSqlFn): string[] {
  return (tx as unknown as { queries: string[] }).queries;
}

/** the audit INSERTs issued through the wrapped fake (params include action/detail) */
function auditCalls(tx: TxSqlFn): Array<{ action: string; targetType: string; targetId: string; fromState: string | null; toState: string | null; detail: string; label: string }> {
  const calls = (tx as unknown as { calls: Array<{ text: string; params: unknown[] }> }).calls;
  return calls
    .filter((c) => c.text.includes("insert into content_review_audit"))
    .map((c) => ({
      label: String(c.params[1]),
      action: String(c.params[2]),
      targetType: String(c.params[3]),
      targetId: String(c.params[4]),
      fromState: c.params[5] == null ? null : String(c.params[5]),
      toState: c.params[6] == null ? null : String(c.params[6]),
      detail: String(c.params[7]),
    }));
}

const clock = { now: () => new Date(0) };

const findPaper = (state = "SUGGESTED", subjectId: string | null = SUBJECT_ID): Route => ({
  match: /select id, subject_id, title, paper_code, session_label, board, qualification, validation_state from exam_papers where id/,
  rows: [],
  rowsFor: (params: unknown[]) =>
    params[0] === PAPER_ID ? [{ ...PAPER_ROW, validation_state: state, subject_id: subjectId }] : [],
});

const versionsOfPaper = (...states: string[]): Route => ({
  match: /select v\.id, v\.question_id, v\.version, v\.validation_state from question_versions v/,
  rows: states.map((s, i) => ({ ...VERSION_ROW, id: `${VERSION_ID.slice(0, -1)}${i}`, validation_state: s })),
});

const schemeForVersion = (state: string | null): Route => ({
  match: /select id, question_version_id, validation_state from mark_schemes where question_version_id/,
  rows: state == null ? [] : [{ ...SCHEME_ROW, validation_state: state }],
});

const schemeById = (state = "SUGGESTED"): Route => ({
  match: /select s\.id, s\.question_version_id, s\.validation_state, \(select count\(\*\) from mark_points mp where mp\.mark_scheme_id = s\.id\) as point_count from mark_schemes s where s\.id/,
  rows: [],
  rowsFor: (params: unknown[]) =>
    params[0] === SCHEME_ID ? [{ ...SCHEME_ROW, validation_state: state, point_count: 2 }] : [],
});

const schemePoints = (): Route => ({
  match: /select mp\.id from mark_points mp where mp\.mark_scheme_id/,
  rows: [{ id: POINT_ID }, { id: "64000000-0000-4000-8000-000000000002" }],
});

const auditRows = (): Route => ({
  match: /insert into content_review_audit/,
  rows: [],
});

describe("actorLabelOf / guards — the frozen recorder + entity laws", () => {
  test("email label passes through; null/blank/anonymousUser → system", () => {
    expect(actorLabelOf({ userId: "u", email: "t@syllab.ai" })).toBe("t@syllab.ai");
    expect(actorLabelOf(null)).toBe("system");
    expect(actorLabelOf({ userId: null, email: null })).toBe("system");
    expect(actorLabelOf({ userId: null, email: "anonymousUser" })).toBe("system");
    expect(actorLabelOf({ userId: null, email: "" })).toBe("system");
  });

  test("flag guard: SUGGESTED/VALIDATED ok; REJECTED/FLAGGED → IllegalState message", () => {
    expect(() => assertFlaggable("paper", "SUGGESTED")).not.toThrow();
    expect(() => assertFlaggable("paper", "VALIDATED")).not.toThrow();
    expect(() => assertFlaggable("paper", "REJECTED")).toThrow(
      "paper in state REJECTED cannot be flagged",
    );
    expect(() => assertFlaggable("question version", "FLAGGED")).toThrow(
      "question version in state FLAGGED cannot be flagged",
    );
    expect(() => assertUnflaggable("mark scheme", "SUGGESTED")).toThrow(
      "mark scheme in state SUGGESTED is not flagged",
    );
    expect(() => assertUnflaggable("mark scheme", "FLAGGED")).not.toThrow();
  });
});

describe("ContentReviewWriteService — paper-level", () => {
  test("placePaper: changes subject + audit PLACE with the verbatim detail", async () => {
    const routes = [
      findPaper(),
      {
        match: /select id, code, name from subjects where id/,
        rows: [],
        rowsFor: (params: unknown[]) =>
          params[0] === SUBJECT2_ID
            ? [{ id: SUBJECT2_ID, code: "CHEM", name: "Chemistry" }]
            : [],
      },
      { match: /update exam_papers set subject_id/, rows: [] },
      auditRows(),
    ];
    const tx = txFakeSql(routes);
    const svc = new ContentReviewWriteService({ sql: tx, clock });
    const out = await svc.placePaper(PAPER_ID, SUBJECT2_ID, TEACHER);
    expect(out.subjectId).toBe(SUBJECT2_ID);
    expect(out.validationState).toBe("SUGGESTED");
    expect(queriesOf(tx).some((t) => t.includes("update exam_papers set subject_id"))).toBe(true);
    expect(auditCalls(tx)).toHaveLength(1);
  });

  test("placePaper: unknown subject → 404 not_found 'subject {id} not found'", async () => {
    const routes = [findPaper(), { match: /select id, code, name from subjects where id/, rows: [] }];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.placePaper(PAPER_ID, UNKNOWN, TEACHER)).rejects.toThrow(
      new NotFoundException("subject", UNKNOWN).message,
    );
  });

  test("validatePaper: unvalidated versions → 409 with the exact count message", async () => {
    const routes = [findPaper(), versionsOfPaper("SUGGESTED", "VALIDATED")];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.validatePaper(PAPER_ID, TEACHER)).rejects.toThrow(
      "paper has 1 unvalidated question version(s) — validate versions first",
    );
  });

  test("validatePaper: schemeless versions → 409 marking-contract message", async () => {
    const routes = [
      findPaper(),
      versionsOfPaper("VALIDATED"),
      schemeForVersion(null),
    ];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.validatePaper(PAPER_ID, TEACHER)).rejects.toThrow(
      "paper has 1 question version(s) without any mark scheme — the deterministic" +
        " marking contract is incomplete; author the schemes first or pass" +
        " force=true to validate anyway",
    );
  });

  test("validatePaper: all-validated + schemes → VALIDATED + audit", async () => {
    const routes = [
      findPaper(),
      versionsOfPaper("VALIDATED"),
      schemeForVersion("SUGGESTED"),
      { match: /update exam_papers set validation_state = 'VALIDATED' where id/, rows: [] },
      auditRows(),
    ];
    const tx = txFakeSql(routes);
    const svc = new ContentReviewWriteService({ sql: tx, clock });
    const out = await svc.validatePaper(PAPER_ID, TEACHER);
    expect(out.validationState).toBe("VALIDATED");
    const audits = auditCalls(tx);
    expect(audits.length).toBe(1);
    expect(audits[0]).toMatchObject({
      label: "t@syllab.ai",
      action: "VALIDATE",
      targetType: "exam_paper",
      targetId: PAPER_ID,
      fromState: "SUGGESTED",
      toState: "VALIDATED",
      detail: "9706/11 June 2014",
    });
  });

  test("flagPaper from REJECTED → plain Error (the opaque-500 wire), message verbatim", async () => {
    const routes = [findPaper("REJECTED")];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.flagPaper(PAPER_ID, TEACHER)).rejects.toThrow(
      "paper in state REJECTED cannot be flagged",
    );
  });

  test("unflagPaper from SUGGESTED → plain Error 'is not flagged'", async () => {
    const routes = [findPaper("SUGGESTED")];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.unflagPaper(PAPER_ID, TEACHER)).rejects.toThrow(
      "paper in state SUGGESTED is not flagged",
    );
  });

  test("unknown paper → 404 'exam paper {id} not found' on every paper route", async () => {
    const routes = [findPaper()];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.validatePaper(UNKNOWN, TEACHER)).rejects.toThrow(`${UNKNOWN} not found`);
    expect(svc.rejectPaper(UNKNOWN, TEACHER)).rejects.toThrow(`exam paper ${UNKNOWN} not found`);
  });
});

describe("ContentReviewWriteService — validate-all (the V20 guard order)", () => {
  test("REJECTED paper → 409 'paper is REJECTED — validation is not possible'", async () => {
    const svc = new ContentReviewWriteService({
      sql: txFakeSql([findPaper("REJECTED")]),
      clock,
    });
    expect(svc.validateAllForPaper(PAPER_ID, false, TEACHER)).rejects.toThrow(
      "paper is REJECTED — validation is not possible",
    );
  });

  test("FLAGGED paper → 409 'paper is FLAGGED — unflag it before validating'", async () => {
    const svc = new ContentReviewWriteService({
      sql: txFakeSql([findPaper("FLAGGED")]),
      clock,
    });
    expect(svc.validateAllForPaper(PAPER_ID, false, TEACHER)).rejects.toThrow(
      "paper is FLAGGED — unflag it before validating",
    );
  });

  test("REVIEW_REQUIRED bridge → 409 unless force", async () => {
    const bridge = {
      match: /select reconciliation_status from glm_ocr_bridge_records where paper_id/,
      rows: [{ reconciliation_status: "REVIEW_REQUIRED" }],
    };
    const svc = new ContentReviewWriteService({
      sql: txFakeSql([findPaper(), bridge]),
      clock,
    });
    expect(svc.validateAllForPaper(PAPER_ID, false, TEACHER)).rejects.toThrow(
      "paper import has REVIEW_REQUIRED reconciliation — review its findings item-by-item, or pass force=true to validate anyway",
    );
    // force=true moves past the bridge guard (and then hits the versions select)
    const routes2 = [
      findPaper(),
      bridge,
      versionsOfPaper("SUGGESTED"),
      schemeForVersion("SUGGESTED"),
      { match: /update question_versions set validation_state = 'VALIDATED' where id/, rows: [] },
      { match: /update mark_schemes set validation_state = 'VALIDATED' where id/, rows: [] },
      { match: /update exam_papers set validation_state = 'VALIDATED' where id/, rows: [] },
      auditRows(),
    ];
    const svc2 = new ContentReviewWriteService({ sql: txFakeSql(routes2), clock });
    const out = await svc2.validateAllForPaper(PAPER_ID, true, TEACHER);
    expect(out).toEqual({
      paperId: PAPER_ID,
      paperState: "VALIDATED",
      totalVersions: 1,
      versionsValidated: 1,
      schemesValidated: 1,
    });
  });

  test("REJECTED/FLAGGED versions block the batch → 409 naming the count", async () => {
    const svc = new ContentReviewWriteService({
      sql: txFakeSql([findPaper(), { match: /select reconciliation_status from glm_ocr_bridge_records where paper_id/, rows: [] }, versionsOfPaper("REJECTED", "FLAGGED")]),
      clock,
    });
    expect(svc.validateAllForPaper(PAPER_ID, false, TEACHER)).rejects.toThrow(
      "paper has 2 REJECTED/FLAGGED question version(s) — resolve them before batch validation",
    );
  });

  test("batch audit writes VALIDATE rows per item + the VALIDATE_ALL summary row", async () => {
    const routes = [
      findPaper(),
      { match: /select reconciliation_status from glm_ocr_bridge_records where paper_id/, rows: [] },
      versionsOfPaper("SUGGESTED"),
      schemeForVersion("SUGGESTED"),
      { match: /update question_versions set validation_state = 'VALIDATED' where id/, rows: [] },
      { match: /update mark_schemes set validation_state = 'VALIDATED' where id/, rows: [] },
      { match: /update exam_papers set validation_state = 'VALIDATED' where id/, rows: [] },
      auditRows(),
    ];
    const tx = txFakeSql(routes);
    const svc = new ContentReviewWriteService({ sql: tx, clock });
    await svc.validateAllForPaper(PAPER_ID, false, TEACHER);
    const audits = auditCalls(tx);
    expect(audits.length).toBe(3); // version + scheme + paper
    expect(audits[0]).toMatchObject({ action: "VALIDATE", targetType: "question_version", detail: "batch validate-all" });
    expect(audits[1]).toMatchObject({ action: "VALIDATE", targetType: "mark_scheme", detail: "batch validate-all" });
    expect(audits[2]).toMatchObject({
      action: "VALIDATE_ALL",
      targetType: "exam_paper",
      fromState: "SUGGESTED",
      toState: "VALIDATED",
      detail: "1 versions + 1 schemes, force=false",
    });
  });
});

describe("ContentReviewWriteService — mark-scheme level", () => {
  test("validate with criteria + guidance: point update + guidance + audit detail", async () => {
    const routes = [
      schemeById(),
      schemePoints(),
      { match: /update mark_points set acceptance_criteria/, rows: [] },
      {
        match: /update mark_schemes set validation_state = 'VALIDATED', general_guidance/,
        rows: [],
      },
      auditRows(),
    ];
    const tx = txFakeSql(routes);
    const svc = new ContentReviewWriteService({ sql: tx, clock });
    const out = await svc.validateMarkScheme(
      SCHEME_ID,
      [{ markPointId: POINT_ID, acceptanceCriteria: ["wt = mv", "correct units"] }],
      "  accept ecf  ",
      TEACHER,
    );
    expect(out).toEqual({
      id: SCHEME_ID,
      questionVersionId: VERSION_ID,
      pointCount: 2,
      validationState: "VALIDATED",
    });
    const audits = auditCalls(tx);
    expect(audits[0]).toMatchObject({
      action: "VALIDATE",
      targetType: "mark_scheme",
      detail: "1 criteria updates + general guidance",
    });
    // the guidance is the STRIPPED value (V34 law) — params[0] = guidance
    const guidanceUpdate = (tx as unknown as { calls: Array<{ text: string; params: unknown[] }> }).calls.find(
      (c) => c.text.includes("general_guidance"),
    );
    expect(guidanceUpdate?.params[0]).toBe("accept ecf");
  });

  test("no body = validate as-is (no guidance update issued)", async () => {
    const routes = [
      schemeById(),
      schemePoints(),
      { match: /update mark_schemes set validation_state = 'VALIDATED' where id/, rows: [] },
      auditRows(),
    ];
    const tx = txFakeSql(routes);
    const svc = new ContentReviewWriteService({ sql: tx, clock });
    await svc.validateMarkScheme(SCHEME_ID, null, null, TEACHER);
    expect(queriesOf(tx).some((t) => t.includes("general_guidance"))).toBe(false);
    expect(auditCalls(tx)[0]).toMatchObject({ detail: "0 criteria updates" });
  });

  test("null markPointId → 404 'mark point in scheme null not found' (no cascade law)", async () => {
    const routes = [schemeById(), schemePoints()];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(
      svc.validateMarkScheme(SCHEME_ID, [{ markPointId: null, acceptanceCriteria: ["x"] }], null, TEACHER),
    ).rejects.toThrow("mark point in scheme null not found");
  });

  test("unknown scheme → 404 'mark scheme {id} not found'", async () => {
    const routes: Route[] = [
      { match: /select s\.id, s\.question_version_id.*from mark_schemes s where s\.id/, rows: [] },
    ];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.rejectMarkScheme(UNKNOWN, TEACHER)).rejects.toThrow(`mark scheme ${UNKNOWN} not found`);
  });
});

describe("ContentReviewWriteService — §10 topic mapping", () => {
  const questionFind = (): Route => ({
    match: /select id from questions where id/,
    rows: [],
    rowsFor: (params: unknown[]) => (params[0] === QUESTION_ID ? [{ id: QUESTION_ID }] : []),
  });
  const nodeFind = (): Route => ({
    match: /select id, code, title from knowledge_nodes where id/,
    rows: [],
    rowsFor: (params: unknown[]) => {
      if (params[0] === NODE_ID) return [NODE_ROW];
      if (params[0] === NODE2_ID) return [{ id: NODE2_ID, code: "3.1.2", title: "Carbonyls" }];
      return [];
    },
  });
  const topicWrites = (): Route[] => [
    { match: /update questions set primary_topic_node_id/, rows: [] },
    { match: /delete from question_topics where question_id/, rows: [] },
    { match: /insert into question_topics/, rows: [] },
    auditRows(),
  ];

  test("happy path: primary + secondaries, topicCount = 1 + n, audit MAP_TOPICS", async () => {
    const routes = [questionFind(), nodeFind(), ...topicWrites()];
    const tx = txFakeSql(routes);
    const svc = new ContentReviewWriteService({ sql: tx, clock });
    const out = await svc.mapQuestionTopics(QUESTION_ID, NODE_ID, [NODE2_ID], TEACHER);
    expect(out).toEqual({
      questionId: QUESTION_ID,
      primaryNodeId: NODE_ID,
      primaryCode: "3.1.1",
      primaryTitle: "Esters",
      topicCount: 2,
    });
    expect(queriesOf(tx).filter((t) => t.includes("insert into question_topics")).length).toBe(2);
    expect(auditCalls(tx)[0]).toMatchObject({ action: "MAP_TOPICS", detail: "primary 3.1.1 + 1 secondary" });
  });

  test("unknown question → 404 'question {id} not found' (the 088 leg-08 law)", async () => {
    const routes: Route[] = [{ match: /select id from questions where id/, rows: [] }];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.mapQuestionTopics(UNKNOWN, NODE_ID, null, TEACHER)).rejects.toThrow(
      `question ${UNKNOWN} not found`,
    );
  });

  test("unknown primary node → 404 'curriculum topic {id} not found'", async () => {
    const routes: Route[] = [
      { match: /select id from questions where id/, rows: [{ id: QUESTION_ID }] },
      { match: /select id, code, title from knowledge_nodes where id/, rows: [] },
    ];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.mapQuestionTopics(QUESTION_ID, UNKNOWN, null, TEACHER)).rejects.toThrow(
      `curriculum topic ${UNKNOWN} not found`,
    );
  });

  test("ING- anchor primary → 409 with the verbatim guard", async () => {
    const routes = [
      questionFind(),
      {
        match: /select id, code, title from knowledge_nodes where id/,
        rows: [{ id: NODE_ID, code: "ING-abc12345", title: "anchor" }],
      },
    ];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.mapQuestionTopics(QUESTION_ID, NODE_ID, null, TEACHER)).rejects.toThrow(
      `primary topic ING-abc12345 is an ingestion anchor — pick a real curriculum topic`,
    );
  });

  test("ING- anchor secondary → 409 'secondary topic … pick real curriculum topics'", async () => {
    const routes = [
      questionFind(),
      // the override must PRECEDE nodeFind — fakeSql is first-match-wins;
      // it must still answer the PRIMARY lookup (NODE_ID) or the primary 404s
      {
        match: /select id, code, title from knowledge_nodes where id/,
        rows: [],
        rowsFor: (params: unknown[]) =>
          params[0] === NODE2_ID
            ? [{ id: NODE2_ID, code: "ING-deadbeef", title: "anchor" }]
            : params[0] === NODE_ID
              ? [NODE_ROW]
              : [],
      },
      nodeFind(),
    ];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.mapQuestionTopics(QUESTION_ID, NODE_ID, [NODE2_ID], TEACHER)).rejects.toThrow(
      "secondary topic ING-deadbeef is an ingestion anchor — pick real curriculum topics",
    );
  });

  test("secondaries dedup (LinkedHashSet) and cap at 5", async () => {
    const five = [
      "20000000-0000-4000-8000-0000000000a1",
      "20000000-0000-4000-8000-0000000000a2",
      "20000000-0000-4000-8000-0000000000a3",
      "20000000-0000-4000-8000-0000000000a4",
      "20000000-0000-4000-8000-0000000000a5",
      "20000000-0000-4000-8000-0000000000a6", // the 6th never maps
    ];
    const allNodes = [
      ...five.map((id) => ({ id, code: "3.1.1", title: "t" })),
      NODE_ROW,
      { id: NODE2_ID, code: "3.1.2", title: "Carbonyls" },
    ];
    const routes = [
      questionFind(),
      {
        match: /select id, code, title from knowledge_nodes where id/,
        rows: [],
        rowsFor: (params: unknown[]) => allNodes.filter((n) => n.id === params[0]),
      },
      ...topicWrites(),
    ];
    const tx = txFakeSql(routes);
    const svc = new ContentReviewWriteService({ sql: tx, clock });
    const out = await svc.mapQuestionTopics(QUESTION_ID, NODE_ID, five, TEACHER);
    expect(out.topicCount).toBe(6); // 5 secondaries + the primary
    expect(queriesOf(tx).filter((t) => t.includes("insert into question_topics")).length).toBe(6);
  });

  test("a null secondary id → 404 'curriculum topic null not found' without a query", async () => {
    const routes = [questionFind(), nodeFind()];
    const svc = new ContentReviewWriteService({ sql: txFakeSql(routes), clock });
    expect(svc.mapQuestionTopics(QUESTION_ID, NODE_ID, [null], TEACHER)).rejects.toThrow(
      "curriculum topic null not found",
    );
  });
});

// ── Tier 2: the route wire contract ─────────────────────────────────────────

function fakeAppFor(writes: Record<string, unknown>, overrides: Record<string, unknown> = {}): ContentReadApp {
  const base = {
    documents: {
      findAllByOrderByCreatedAtDesc: async () => [],
      findById: async () => null,
      findTopByDocumentIdOrderByDocVersionDesc: async () => null,
      existsCitable: async () => false,
      canonicalJsonText: async () => null,
    },
    questionAssets: { findByFilename: async () => null },
    review: {},
    writes,
    ingestDocument: async () => {
      throw new Error("not faked");
    },
    ingestPastPaper: async () => {
      throw new Error("not faked");
    },
    scope: { resolveActive: async () => null, resolveForCourse: async () => null },
    requesterId: (_c: Context) => "u-teacher",
    requireEmbeddingProvider: () => {
      throw new Error("not faked");
    },
    searchServingEligible: async () => [],
    diagnoseEmpty: async () => ({ chunksInScope: 0, embeddedInScope: 0, inScopeAtRev: 0, servingEligible: 0 }),
    embedDocument: async () => {
      throw new Error("not faked");
    },
    pageText: () => "",
    paperRefOf: async () => null,
    toCitationView: () => ({}),
    toDocumentSummary: () => ({}),
    ...overrides,
  };
  return base as unknown as ContentReadApp;
}

function wireApp(writes: Record<string, unknown>, overrides: Record<string, unknown> = {}): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("syllabai.auth" as never, { userId: "u-teacher", email: "t@syllab.ai", roles: ["TEACHER"] } as never);
    await next();
  });
  app.onError((err, c) => {
    const status = (err as { status?: number }).status;
    const code = (err as { code?: string }).code;
    if (status && code) {
      return c.json({ status, error: code, message: err.message, timestamp: "2026-10-05T00:00:00Z" }, status as 400);
    }
    return c.json(
      { status: 500, error: "internal_error", message: "an internal error occurred", timestamp: "2026-10-05T00:00:00Z" },
      500,
    );
  });
  app.route("/", createTeacherContentRouter(fakeAppFor(writes, overrides)));
  return app;
}

const CANONICAL_OK = {
  schemaVersion: "1.0",
  documentId: "doc-1",
  version: 1,
  pageCount: 1,
  textBlocks: [{ textBlockId: "t1", page: 1, text: "hello" }],
  provenance: { engine: "glm", engineVersion: "1" },
  source: { uri: "gs://b/f.pdf", mimeType: "application/pdf", checksum: "c0ffee" },
};

describe("POST /documents — the ingest wire", () => {
  test("201 IngestionView with the kind echo", async () => {
    const calls: unknown[] = [];
    const app = wireApp(
      {},
      {
        ingestDocument: async (kind: string, raw: string, by: string | null) => {
          calls.push({ kind, raw, by });
          return { id: "row-1", documentId: "doc-1", duplicate: false, chunks: 3, elements: 8, pages: 2 };
        },
      },
    );
    const res = await app.request(`/documents?kind=QUESTION_PAPER`, {
      method: "POST",
      body: JSON.stringify(CANONICAL_OK),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      id: "row-1",
      documentId: "doc-1",
      duplicate: false,
      chunks: 3,
      elements: 8,
      pages: 2,
      kind: "QUESTION_PAPER",
    });
    expect(calls[0]).toMatchObject({ kind: "QUESTION_PAPER", by: "u-teacher" });
  });

  test("kind defaults to OTHER; a bad kind → 400 malformed request BEFORE the body", async () => {
    const kinds: string[] = [];
    const app = wireApp(
      {},
      {
        ingestDocument: async (kind: string) => {
          kinds.push(kind);
          return { id: "row-1", documentId: "doc-1", duplicate: false, chunks: 0, elements: 0, pages: 1 };
        },
      },
    );
    const bad = await app.request(`/documents?kind=NOT_A_KIND`, {
      method: "POST",
      body: JSON.stringify(CANONICAL_OK),
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toBe("malformed request");
    const def = await app.request(`/documents`, {
      method: "POST",
      body: JSON.stringify(CANONICAL_OK),
    });
    expect(def.status).toBe(201);
    expect((await def.json()).kind).toBe("OTHER");
    expect(kinds).toEqual(["OTHER"]);
  });

  test("a non-canonical body → 400 invalid_document with the fixed client message", async () => {
    const app = wireApp(
      {},
      {
        ingestDocument: async () =>
          Promise.reject(new InvalidDocumentError("request body is not a canonical document (schema 1.0)", [])),
      },
    );
    const res = await app.request(`/documents`, { method: "POST", body: '{"nope":true}' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_document");
    expect(body.message).toBe("request body is not a canonical document (schema 1.0)");
  });

  test("an empty body → 400 malformed_body", async () => {
    const app = wireApp({});
    const res = await app.request(`/documents`, { method: "POST", body: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });
});

describe("POST /past-papers — the draft-ingest wire", () => {
  const draft = {
    schemaVersion: "1.0",
    paper: {
      board: "CIE",
      qualification: "A Level",
      subject: "9706",
      unit: null,
      sessionLabel: "June 2014",
      paperCode: "9706/11",
      questionPaperDocumentId: null,
      markSchemeDocumentId: null,
    },
    questions: [
      {
        externalRef: null,
        questionNumber: "1",
        prompt: "stem",
        commandWord: null,
        marks: 2,
        questionType: "STRUCTURED",
        pageNumber: 2,
        confidence: 0.9,
        parts: [{ label: "(a)", prompt: "part text", commandWord: null, marks: 2, confidence: 0.9 }],
      },
    ],
    markScheme: {
      version: "1",
      sourceDocumentId: null,
      points: [{ questionRef: "1", order: 1, text: "pt", marks: 2, acceptance: null, confidence: 0.8 }],
      generalGuidance: null,
    },
    extractionMethod: "glm-ocr",
    reviewRequired: false,
  };

  test("201 IngestionResultView with validationState SUGGESTED", async () => {
    const app = wireApp(
      {},
      {
        ingestPastPaper: async () => ({ paperId: PAPER_ID, questions: 1, parts: 1, markPoints: 1 }),
      },
    );
    const res = await app.request(`/past-papers`, { method: "POST", body: JSON.stringify(draft) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      paperId: PAPER_ID,
      questions: 1,
      parts: 1,
      markPoints: 1,
      validationState: "SUGGESTED",
    });
  });

  test("an unsupported schemaVersion → 409 BEFORE ingestion (the ContentController guard)", async () => {
    const calls: unknown[] = [];
    const app = wireApp(
      {},
      { ingestPastPaper: async (...a: unknown[]) => { calls.push(a); return { paperId: PAPER_ID, questions: 0, parts: 0, markPoints: 0 }; } },
    );
    const res = await app.request(`/past-papers`, {
      method: "POST",
      body: JSON.stringify({ ...draft, schemaVersion: "2.0" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("unsupported draft schemaVersion 2.0 (expected 1.0)");
    expect(calls.length).toBe(0);
  });

  test("a shape-broken draft → 400 malformed_body", async () => {
    const app = wireApp({});
    const res = await app.request(`/past-papers`, {
      method: "POST",
      body: JSON.stringify({ paper: 42, questions: "no" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });
});

describe("POST /questions/:id/topics — the 088 golden laws", () => {
  test("leg-09 law: null primaryNodeId → 400 validation_failed 'primaryNodeId: must not be null'", async () => {
    const app = wireApp({});
    const res = await app.request(`/questions/${QUESTION_ID}/topics`, {
      method: "POST",
      body: JSON.stringify({ primaryNodeId: null }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("primaryNodeId: must not be null");
  });

  test("leg-08 law: a valid body over an unknown question → 404 not_found", async () => {
    const app = wireApp({
      mapQuestionTopics: async () =>
        Promise.reject(new NotFoundException("question", UNKNOWN)),
    });
    const res = await app.request(`/questions/${UNKNOWN}/topics`, {
      method: "POST",
      body: JSON.stringify({ primaryNodeId: NODE_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toBe(`question ${UNKNOWN} not found`);
  });

  test("a non-uuid primaryNodeId string → 400 malformed_body (the Jackson parse law)", async () => {
    const app = wireApp({});
    const res = await app.request(`/questions/${QUESTION_ID}/topics`, {
      method: "POST",
      body: JSON.stringify({ primaryNodeId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });

  test("the happy path passes primaryNodeId + secondaryNodeIds + the actor to the service", async () => {
    const seen: unknown[] = [];
    const app = wireApp({
      mapQuestionTopics: async (...a: unknown[]) => {
        seen.push(a);
        return { questionId: QUESTION_ID, primaryNodeId: NODE_ID, primaryCode: "3.1.1", primaryTitle: "Esters", topicCount: 2 };
      },
    });
    const res = await app.request(`/questions/${QUESTION_ID}/topics`, {
      method: "POST",
      body: JSON.stringify({ primaryNodeId: NODE_ID, secondaryNodeIds: [NODE2_ID], extra: "ignored" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).topicCount).toBe(2);
    expect(seen[0]).toEqual([QUESTION_ID, NODE_ID, [NODE2_ID], { userId: "u-teacher", email: "t@syllab.ai" }]);
  });
});

describe("the §7 wire — guards, statuses, actor plumbing", () => {
  test("place with null subjectId → 400 validation_failed 'subjectId: must not be null'", async () => {
    const app = wireApp({});
    const res = await app.request(`/exam-papers/${PAPER_ID}/place`, {
      method: "POST",
      body: JSON.stringify({ subjectId: null }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("subjectId: must not be null");
  });

  test("validate-all with a non-boolean force → 400 malformed request", async () => {
    const app = wireApp({});
    const res = await app.request(`/exam-papers/${PAPER_ID}/validate-all?force=maybe`, { method: "POST" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });

  test("validate-all passes the parsed force to the service", async () => {
    const seen: unknown[] = [];
    const app = wireApp({ validateAllForPaper: async (...a: unknown[]) => { seen.push(a); return { paperId: PAPER_ID, paperState: "VALIDATED", totalVersions: 0, versionsValidated: 0, schemesValidated: 0 }; } });
    const res = await app.request(`/exam-papers/${PAPER_ID}/validate-all?force=TRUE`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(seen[0]).toEqual([PAPER_ID, true, { userId: "u-teacher", email: "t@syllab.ai" }]);
  });

  test("a ConflictException guard → 409 conflict", async () => {
    const app = wireApp({
      validatePaper: async () =>
        Promise.reject(new ConflictException("paper has 2 unvalidated question version(s) — validate versions first")),
    });
    const res = await app.request(`/exam-papers/${PAPER_ID}/validate`, { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict");
    expect(body.message).toBe("paper has 2 unvalidated question version(s) — validate versions first");
  });

  test("the IllegalState flag guard → opaque 500 'an internal error occurred'", async () => {
    const app = wireApp({
      flagPaper: async () => Promise.reject(new Error("paper in state REJECTED cannot be flagged")),
    });
    const res = await app.request(`/exam-papers/${PAPER_ID}/flag`, { method: "POST" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
    expect(body.message).toBe("an internal error occurred");
  });

  test("version-level routes pass through to the service with the actor", async () => {
    const seen: unknown[] = [];
    const app = wireApp({
      flagQuestionVersion: async (...a: unknown[]) => {
        seen.push(a);
        return { id: VERSION_ID, questionId: QUESTION_ID, version: 1, validationState: "FLAGGED" };
      },
      unflagMarkScheme: async (...a: unknown[]) => {
        seen.push(a);
        return { id: SCHEME_ID, questionVersionId: VERSION_ID, pointCount: 3, validationState: "SUGGESTED" };
      },
    });
    const vRes = await app.request(`/question-versions/${VERSION_ID}/flag`, { method: "POST" });
    expect(vRes.status).toBe(200);
    expect(await vRes.json()).toEqual({ id: VERSION_ID, questionId: QUESTION_ID, version: 1, validationState: "FLAGGED" });
    const sRes = await app.request(`/mark-schemes/${SCHEME_ID}/unflag`, { method: "POST" });
    expect(sRes.status).toBe(200);
    expect(await sRes.json()).toEqual({ id: SCHEME_ID, questionVersionId: VERSION_ID, pointCount: 3, validationState: "SUGGESTED" });
    expect(seen[0]).toEqual([VERSION_ID, { userId: "u-teacher", email: "t@syllab.ai" }]);
    expect(seen[1]).toEqual([SCHEME_ID, { userId: "u-teacher", email: "t@syllab.ai" }]);
  });

  test("mark-scheme validate with NO body validates as-is (required=false law)", async () => {
    const seen: unknown[] = [];
    const app = wireApp({
      validateMarkScheme: async (...a: unknown[]) => {
        seen.push(a);
        return { id: SCHEME_ID, questionVersionId: VERSION_ID, pointCount: 0, validationState: "VALIDATED" };
      },
    });
    const res = await app.request(`/mark-schemes/${SCHEME_ID}/validate`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(seen[0]).toEqual([SCHEME_ID, null, null, { userId: "u-teacher", email: "t@syllab.ai" }]);
  });

  test("mark-scheme validate passes criteria + guidance; a null markPointId reaches the service", async () => {
    const seen: unknown[] = [];
    const app = wireApp({
      validateMarkScheme: async (...a: unknown[]) => {
        seen.push(a);
        return { id: SCHEME_ID, questionVersionId: VERSION_ID, pointCount: 1, validationState: "VALIDATED" };
      },
    });
    const res = await app.request(`/mark-schemes/${SCHEME_ID}/validate`, {
      method: "POST",
      body: JSON.stringify({ criteria: [{ markPointId: null, acceptanceCriteria: null }], generalGuidance: "accept ecf" }),
    });
    expect(res.status).toBe(200);
    expect(seen[0]).toEqual([
      SCHEME_ID,
      [{ markPointId: null, acceptanceCriteria: null }],
      "accept ecf",
      { userId: "u-teacher", email: "t@syllab.ai" },
    ]);
  });

  test("a malformed-uuid markPointId string → 400 malformed_body (the Jackson parse law)", async () => {
    const app = wireApp({});
    const res = await app.request(`/mark-schemes/${SCHEME_ID}/validate`, {
      method: "POST",
      body: JSON.stringify({ criteria: [{ markPointId: "zzz", acceptanceCriteria: [] }] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed_body");
  });

  test("path-variable uuid conversion parity: a bad route id → 400 malformed request", async () => {
    const app = wireApp({});
    const res = await app.request(`/exam-papers/not-a-uuid/validate`, { method: "POST" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("malformed request");
  });
});
