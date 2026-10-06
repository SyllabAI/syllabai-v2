/**
 * Knowledge + coverage service unit tests (T-MIG-053 tranche 1) — stubbed
 * sql via the shared fakeSql helper (+ param-aware routes). Pins the frozen
 * law @ 6cad6ef: the coverage Status parse/wire law (trim+lowercase
 * tolerant incl. the not_taught underscore form, verbatim 400), the note
 * normalization (trim, blank → null), the §17 ownership gate (404 class
 * not found / 403 this class belongs to another teacher), the coverageMark
 * fail-closed gate ORDER (409 archived → 400 status → 404 spec point →
 * 400 the V39 spec-point invariant), the idempotent identical re-mark
 * (no INSERT on the repeat), the one-audit-event-per-change law with
 * previous_status null on the first event, firstMarkedAt = created_at
 * never mutating, the recorded-rows-only list (spec_point_node_id asc,
 * vanished node → null code/title), the node 404-first law ("knowledge
 * node <id> not found"), the tree assembly (children by source code,
 * dangling skip, the V15 misconception fold on TOPIC/SUBTOPIC + CONCEPT
 * with the dedupe law), the closure CTE order (deepest first, then node
 * id) and the misconception direction law (source = the misconception,
 * pass-through order).
 */
import { describe, expect, test } from "bun:test";
import {
  KnowledgeForbiddenError,
  KnowledgeNotFoundError,
  coverageList,
  coverageHistory,
  coverageMark,
  coverageStatusWire,
  knowledgeNode,
  knowledgeTree,
  knowledgePrerequisites,
  knowledgeMisconceptions,
  normalizeNote,
  parseCoverageStatus,
} from "../../src/services/knowledge";
import type { KnowledgeDeps } from "../../src/services/knowledge";
import { BadRequestError, ConflictError, type SubmitClock } from "../../src/services/selfmark";
import { fakeSql, type Route } from "../assessment/helpers";

// ── fixtures (fixed-constant uuids; the fleet's captured-shape style) ───────

const TEACHER = "ee000000-0000-4000-8000-000000000001";
const OTHER_TEACHER = "ee000000-0000-4000-8000-000000000002";
const CLASS_A = "ec000000-0000-4000-8000-000000000001";
const SUBJECT = "ea000000-0000-4000-8000-000000000001";
const UNIT = "ea000000-0000-4000-8000-000000000002";
const TOPIC = "ea000000-0000-4000-8000-000000000003";
const SUBTOPIC = "ea000000-0000-4000-8000-000000000004";
const SUBTOPIC_2 = "ea000000-0000-4000-8000-000000000005";
const MISCONCEPTION = "ea000000-0000-4000-8000-000000000006";
const PREREQ_A = "ea000000-0000-4000-8000-000000000007";
const PREREQ_B = "ea000000-0000-4000-8000-000000000008";
const CONCEPT = "ea000000-0000-4000-8000-000000000009";

const T0 = "2026-10-01T10:00:00Z";
const T1 = "2026-10-02T10:00:00Z";
const NOW_TEXT = "2026-10-06T08:00:00Z";
const NOW_ISO = "2026-10-06T08:00:00.000Z"; // toInstant(NOW_TEXT) — the fleet's Date rendering

let NOW = new Date(NOW_TEXT);
const clock: SubmitClock = {
  newId: () => "7e571d00-0000-4000-8000-000000000001",
  now: () => NOW,
};
const deps = (routes: Route[]): KnowledgeDeps => ({ sql: fakeSql(routes), clock });

// ── row factories ────────────────────────────────────────────────────────────

const classRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: CLASS_A,
  status: "ACTIVE",
  teacher_id: TEACHER,
  ...over,
});

const nodeRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: SUBTOPIC,
  code: "4CH1/1.2",
  node_type: "SUBTOPIC",
  title: "Titration calculations",
  description: null,
  validation_status: "VALIDATED",
  provenance: "seed",
  applicability: { papers: ["1CH1"], tier: "foundation" },
  ...over,
});

const coverageRow = (over: Partial<Record<string, unknown>> = {}) => ({
  class_id: CLASS_A,
  spec_point_node_id: SUBTOPIC,
  status: "TAUGHT",
  marked_by: TEACHER,
  marked_at: T1,
  note: null,
  created_at: T0,
  ...over,
});

// ── shared route shapes (fakeSql renders template strings joined " ? ") ─────

const ownedClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match: /select id, status, teacher_id from classes where id = \? ::uuid$/,
  rows,
});

const nodesByIdsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
  rows,
});

const nodeByIdRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid$/,
  rows,
});

const coverageByClassRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid order by spec_point_node_id asc$/,
  rows,
});

const coverageOneRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at from teaching_coverage where class_id = \? ::uuid and spec_point_node_id = \? ::uuid$/,
  rows,
});

const coverageEventsRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select status, previous_status, actor_id, note, created_at from teaching_coverage_events where class_id = \? ::uuid and spec_point_node_id = \? ::uuid order by created_at desc$/,
  rows,
});

const insertCoverageRoute = (log: string[]): Route => ({
  match: /^insert into teaching_coverage \(class_id, spec_point_node_id, status, marked_by, marked_at, note, created_at\)/,
  rows: [],
  rowsFor: (params) => {
    log.push(`row:${params[2]}:${params[6]}`);
    return [];
  },
});

const insertEventRoute = (log: string[]): Route => ({
  match: /^insert into teaching_coverage_events \(id, class_id, spec_point_node_id, status, previous_status, actor_id, note, created_at\)/,
  rows: [],
  rowsFor: (params) => {
    log.push(`event:${params[3]}:prev=${params[4] ?? "null"}`);
    return [];
  },
});

const updateCoverageRoute = (log: string[]): Route => ({
  match: /^update teaching_coverage set status/,
  rows: [],
  rowsFor: (params) => {
    log.push(`update:${params[0]}`);
    return [];
  },
});

const subtreeRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /with recursive subtree as \( select n\.id from knowledge_nodes n where n\.id = \? ::uuid union select e\.source_node_id from knowledge_edges e join subtree s on e\.target_node_id = s\.id where e\.relation_type = 'PART_OF' \) select n\.id from knowledge_nodes n where n\.id in \(select id from subtree\)$/,
  rows,
});

const partOfEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select e\.source_node_id, e\.target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type = 'PART_OF'$/,
  rows,
});

const familyEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability, e\.source_node_id as edge_source_node_id, e\.target_node_id as edge_target_node_id, s\.code as source_code from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type in \('MISCONCEPTION_OF', 'REMEDIATED_BY', 'WRONG_ANSWER_PATTERN'\)$/,
  rows,
});

const closureRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /with recursive prereq as \( select e\.target_node_id as node_id, 1 as depth from knowledge_edges e where e\.source_node_id = \? ::uuid and e\.relation_type = 'REQUIRES_PREREQUISITE' union select e\.target_node_id, p\.depth \+ 1 from knowledge_edges e join prereq p on e\.source_node_id = p\.node_id where e\.relation_type = 'REQUIRES_PREREQUISITE' and p\.depth < 10 \) select node_id, max\(depth\) as depth from prereq group by node_id order by depth desc, node_id$/,
  rows,
});

const misconceptionEdgesRoute = (rows: Array<Record<string, unknown>>): Route => ({
  match:
    /select s\.id, s\.code, s\.node_type, s\.title, s\.description, s\.validation_status, s\.provenance, s\.applicability from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = \? ::uuid and e\.relation_type = 'MISCONCEPTION_OF'$/,
  rows,
});

// ── the parse/wire law (TeachingCoverage.Status :39-56) ─────────────────────

describe("coverage Status parse/wire law", () => {
  test("tolerant: trim + lowercase, both kebab and underscore not-taught forms", () => {
    expect(parseCoverageStatus("taught")).toBe("TAUGHT");
    expect(parseCoverageStatus("  TAUGHT ")).toBe("TAUGHT");
    expect(parseCoverageStatus("not-taught")).toBe("NOT_TAUGHT");
    expect(parseCoverageStatus("NOT_TAUGHT")).toBe("NOT_TAUGHT");
    expect(parseCoverageStatus(null)).toBeNull();
    expect(parseCoverageStatus("maybe")).toBeNull();
    expect(parseCoverageStatus("")).toBeNull();
  });

  test("wire form is the canonical kebab lowercase", () => {
    expect(coverageStatusWire("TAUGHT")).toBe("taught");
    expect(coverageStatusWire("NOT_TAUGHT")).toBe("not-taught");
  });

  test("normalizeNote: trim; blank → null (the honest absence)", () => {
    expect(normalizeNote("  covered in W2  ")).toBe("covered in W2");
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(null)).toBeNull();
  });
});

// ── the §17 ownership gate + the coverageMark gate ORDER (:116-160) ─────────

describe("coverage ownership + mark gate order", () => {
  test("404 class not found (unknown class)", async () => {
    const d = deps([ownedClassRoute([])]);
    await expect(coverageList(d, TEACHER, CLASS_A)).rejects.toThrow(
      new KnowledgeNotFoundError("class not found"),
    );
  });

  test("403 this class belongs to another teacher (§17 — even a valid class)", async () => {
    const d = deps([ownedClassRoute([classRow({ teacher_id: OTHER_TEACHER })])]);
    await expect(coverageList(d, TEACHER, CLASS_A)).rejects.toThrow(
      new KnowledgeForbiddenError("this class belongs to another teacher"),
    );
  });

  test("409 archived — reopen it before marking coverage (exact message)", async () => {
    const d = deps([ownedClassRoute([classRow({ status: "ARCHIVED" })])]);
    await expect(
      coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, { status: "taught" }),
    ).rejects.toThrow(
      new ConflictError("this class is archived — reopen it before marking coverage"),
    );
  });

  test("400 status must be 'taught' or 'not-taught' (verbatim, after the archived gate)", async () => {
    const d = deps([ownedClassRoute([classRow()])]);
    await expect(
      coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, { status: "maybe" }),
    ).rejects.toThrow(new BadRequestError("status must be 'taught' or 'not-taught'"));
  });

  test("404 specification point not found (unknown node, after the status gate)", async () => {
    const d = deps([ownedClassRoute([classRow()]), nodeByIdRoute([])]);
    await expect(
      coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, { status: "taught" }),
    ).rejects.toThrow(new KnowledgeNotFoundError("specification point not found"));
  });

  test("400 that node is not a specification point — non-SUBTOPIC refused", async () => {
    const d = deps([
      ownedClassRoute([classRow()]),
      nodeByIdRoute([nodeRow({ node_type: "TOPIC" })]),
    ]);
    await expect(
      coverageMark(d, TEACHER, CLASS_A, TOPIC, { status: "taught" }),
    ).rejects.toThrow(new BadRequestError("that node is not a specification point"));
  });

  test("400 that node is not a specification point — SUBTOPIC with null applicability refused (fail-closed)", async () => {
    const d = deps([
      ownedClassRoute([classRow()]),
      nodeByIdRoute([nodeRow({ applicability: null })]),
    ]);
    await expect(
      coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, { status: "taught" }),
    ).rejects.toThrow(new BadRequestError("that node is not a specification point"));
  });
});

// ── the write laws (:135-160) ────────────────────────────────────────────────

describe("coverageMark write laws", () => {
  test("fresh mark: inserts the row + ONE event with previous_status null; view carries the node identity", async () => {
    const log: string[] = [];
    const d = deps([
      ownedClassRoute([classRow()]),
      nodeByIdRoute([nodeRow()]),
      coverageOneRoute([]),
      insertCoverageRoute(log),
      insertEventRoute(log),
    ]);
    const view = await coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, {
      status: "Taught",
      note: "  covered  ",
    });
    expect(view).toEqual({
      specPointNodeId: SUBTOPIC,
      code: "4CH1/1.2",
      title: "Titration calculations",
      status: "taught",
      markedBy: TEACHER,
      markedAt: NOW_ISO,
      note: "covered",
      firstMarkedAt: NOW_ISO,
    });
    expect(log).toEqual([
      `row:TAUGHT:${NOW_ISO}`,
      `event:TAUGHT:prev=null`, // the trail's first event: previous null
    ]);
  });

  test("identical re-mark (same parsed status AND same normalized note) = the idempotent no-op: NO writes", async () => {
    const log: string[] = [];
    const d = deps([
      ownedClassRoute([classRow()]),
      nodeByIdRoute([nodeRow()]),
      coverageOneRoute([
        coverageRow({ status: "TAUGHT", note: "covered", marked_at: T1, created_at: T0 }),
      ]),
      insertCoverageRoute(log),
      updateCoverageRoute(log),
    ]);
    const view = await coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, {
      status: "taught",
      note: " covered ", // normalizes to the stored note
    });
    expect(view.firstMarkedAt).toBe(new Date(T0).toISOString()); // first-marked preserved
    expect(view.markedAt).toBe(new Date(T1).toISOString()); // the STORED marked_at, not now
    expect(log).toEqual([]); // zero writes — the honest no-op
  });

  test("information change: exactly ONE audit event (previous_status = the stored status) + the row moves", async () => {
    const log: string[] = [];
    const d = deps([
      ownedClassRoute([classRow()]),
      nodeByIdRoute([nodeRow()]),
      coverageOneRoute([
        coverageRow({ status: "NOT_TAUGHT", note: null, marked_at: T1, created_at: T0 }),
      ]),
      updateCoverageRoute(log),
      insertEventRoute(log),
    ]);
    const view = await coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, { status: "taught" });
    expect(view.status).toBe("taught");
    expect(view.firstMarkedAt).toBe(new Date(T0).toISOString()); // created_at never mutates
    expect(view.markedAt).toBe(NOW_ISO); // the reassert instant
    expect(log).toEqual([`update:TAUGHT`, `event:TAUGHT:prev=NOT_TAUGHT`]);
  });

  test("note-only change still appends the audit event (any information change)", async () => {
    const log: string[] = [];
    const d = deps([
      ownedClassRoute([classRow()]),
      nodeByIdRoute([nodeRow()]),
      coverageOneRoute([coverageRow({ status: "TAUGHT", note: null })]),
      updateCoverageRoute(log),
      insertEventRoute(log),
    ]);
    await coverageMark(d, TEACHER, CLASS_A, SUBTOPIC, { status: "taught", note: "with a plan" });
    expect(log).toEqual([`update:TAUGHT`, `event:TAUGHT:prev=TAUGHT`]);
  });
});

// ── the read laws (:66-92) ───────────────────────────────────────────────────

describe("coverage reads", () => {
  test("list serves only recorded rows, spec_point_node_id asc; vanished node → null code/title", async () => {
    const d = deps([
      ownedClassRoute([classRow()]),
      coverageByClassRoute([
        coverageRow({ spec_point_node_id: SUBTOPIC }),
        coverageRow({
          spec_point_node_id: SUBTOPIC_2,
          status: "NOT_TAUGHT",
          marked_at: T0,
          note: "skipped this term",
        }),
      ]),
      // the V30 NO-ACTION FK lets a curriculum refresh delete the node —
      // only SUBTOPIC_2 resolves; SUBTOPIC is vanished
      nodesByIdsRoute([nodeRow({ id: SUBTOPIC_2, code: "4CH1/1.3", title: "Moles" })]),
    ]);
    const rows = await coverageList(d, TEACHER, CLASS_A);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      specPointNodeId: SUBTOPIC,
      code: null,
      title: null,
      status: "taught",
    });
    expect(rows[0]!.firstMarkedAt).toBe(new Date(T0).toISOString());
    expect(rows[1]).toMatchObject({
      specPointNodeId: SUBTOPIC_2,
      code: "4CH1/1.3",
      status: "not-taught",
      note: "skipped this term",
    });
  });

  test("history: newest first, verbatim, previous_status null on the first event", async () => {
    const d = deps([
      ownedClassRoute([classRow()]),
      coverageEventsRoute([
        { status: "TAUGHT", previous_status: "NOT_TAUGHT", actor_id: TEACHER, note: null, created_at: T1 },
        { status: "NOT_TAUGHT", previous_status: null, actor_id: TEACHER, note: "planning", created_at: T0 },
      ]),
    ]);
    const events = await coverageHistory(d, TEACHER, CLASS_A, SUBTOPIC);
    expect(events).toEqual([
      { status: "taught", previousStatus: "not-taught", actorId: TEACHER, note: null, createdAt: new Date(T1).toISOString() },
      { status: "not-taught", previousStatus: null, actorId: TEACHER, note: "planning", createdAt: new Date(T0).toISOString() },
    ]);
  });
});

// ── the knowledge read laws (KnowledgeController :17-46) ─────────────────────

describe("knowledge node reads", () => {
  test("node: flat projection — children [], enum NAMES, applicability verbatim", async () => {
    const d = deps([nodeByIdRoute([nodeRow()])]);
    const view = await knowledgeNode(d, SUBTOPIC);
    expect(view).toEqual({
      id: SUBTOPIC,
      code: "4CH1/1.2",
      type: "SUBTOPIC",
      title: "Titration calculations",
      description: null,
      validationStatus: "VALIDATED",
      provenance: "seed",
      applicability: { papers: ["1CH1"], tier: "foundation" },
      children: [],
    });
  });

  test("node 404-first: 'knowledge node <id> not found' (shared NotFoundException :14-16)", async () => {
    const d = deps([nodeByIdRoute([])]);
    await expect(knowledgeNode(d, SUBJECT)).rejects.toThrow(
      new KnowledgeNotFoundError(`knowledge node ${SUBJECT} not found`),
    );
  });

  test("tree: children sorted by source code; dangling edge skipped", async () => {
    const d = deps([
      nodeByIdRoute([nodeRow({ id: SUBJECT, code: "4CH1", node_type: "SUBJECT", applicability: null })]),
      subtreeRoute([{ id: SUBJECT }, { id: UNIT }, { id: TOPIC }]),
      nodesByIdsRoute([
        nodeRow({ id: SUBJECT, code: "4CH1", node_type: "SUBJECT", applicability: null }),
        nodeRow({ id: UNIT, code: "4CH1/1", node_type: "UNIT", applicability: null }),
        // TOPIC resolves to NO node row → the edge is dangling → skipped
      ]),
      partOfEdgesRoute([
        { source_node_id: TOPIC, target_node_id: UNIT, source_code: "4CH1/1.1" },
        { source_node_id: UNIT, target_node_id: SUBJECT, source_code: "4CH1/1" },
      ]),
    ]);
    const tree = await knowledgeTree(d, SUBJECT, false);
    expect(tree.type).toBe("SUBJECT");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]!.code).toBe("4CH1/1");
    expect(tree.children[0]!.children).toEqual([]); // the dangling child never appears
  });

  test("tree with misconceptions: the V15 fold — attachments sorted by source code, deduped, attached FLAT", async () => {
    const miscon = nodeRow({
      id: MISCONCEPTION,
      code: "M-INV",
      node_type: "MISCONCEPTION",
      applicability: null,
      provenance: null,
      title: "inverts the ratio",
    });
    const d = deps([
      nodeByIdRoute([nodeRow({ id: TOPIC, code: "4CH1/1.1", node_type: "TOPIC", applicability: null })]),
      subtreeRoute([{ id: TOPIC }]),
      nodesByIdsRoute([nodeRow({ id: TOPIC, code: "4CH1/1.1", node_type: "TOPIC", applicability: null })]),
      partOfEdgesRoute([]),
      familyEdgesRoute([
        { ...miscon, edge_source_node_id: MISCONCEPTION, edge_target_node_id: TOPIC, source_code: "M-INV" },
        { ...miscon, edge_source_node_id: MISCONCEPTION, edge_target_node_id: TOPIC, source_code: "M-INV" }, // the dup edge
      ]),
    ]);
    const tree = await knowledgeTree(d, TOPIC, true);
    expect(tree.children.map((c) => c.code)).toEqual(["M-INV"]); // deduped to one
    expect(tree.children[0]!.children).toEqual([]); // attached FLAT (not a subtree member)
  });

  test("prerequisites: the closure CTE order preserved (deepest first, then node id)", async () => {
    const d = deps([
      nodeByIdRoute([nodeRow({ id: SUBTOPIC })]),
      closureRoute([
        { node_id: PREREQ_B, depth: 2 },
        { node_id: PREREQ_A, depth: 1 },
      ]),
      nodesByIdsRoute([
        nodeRow({ id: PREREQ_A, code: "4CH1/1.1", title: "Direct prereq" }),
        nodeRow({ id: PREREQ_B, code: "4CH1/0.9", title: "Transitive prereq" }),
      ]),
    ]);
    const chain = await knowledgePrerequisites(d, SUBTOPIC);
    expect(chain.map((p) => [p.code, p.depth])).toEqual([
      ["4CH1/0.9", 2], // deepest first — the remediation walk-back order
      ["4CH1/1.1", 1],
    ]);
  });

  test("prerequisites rides the node 404-first law", async () => {
    const d = deps([nodeByIdRoute([])]);
    await expect(knowledgePrerequisites(d, SUBJECT)).rejects.toThrow(
      new KnowledgeNotFoundError(`knowledge node ${SUBJECT} not found`),
    );
  });

  test("misconceptions: 404-first topic; edge sources pass through in query order (no ORDER BY upstream)", async () => {
    const d = deps([
      nodeByIdRoute([nodeRow({ id: TOPIC, node_type: "TOPIC" })]),
      misconceptionEdgesRoute([
        nodeRow({ id: MISCONCEPTION, code: "M-INV", node_type: "MISCONCEPTION", applicability: null }),
      ]),
    ]);
    const mis = await knowledgeMisconceptions(d, TOPIC);
    expect(mis.map((m) => m.code)).toEqual(["M-INV"]);
    expect(mis[0]!.children).toEqual([]);
  });

  test("misconceptions 404 on an unknown topic", async () => {
    const d = deps([nodeByIdRoute([])]);
    await expect(knowledgeMisconceptions(d, TOPIC)).rejects.toThrow(
      new KnowledgeNotFoundError(`knowledge node ${TOPIC} not found`),
    );
  });

  test("CONCEPT nodes are legal tree members (the T-C11 settled graph, V15)", async () => {
    const d = deps([
      nodeByIdRoute([nodeRow({ id: CONCEPT, code: "C-RATIO", node_type: "CONCEPT", applicability: null })]),
      subtreeRoute([{ id: CONCEPT }]),
      nodesByIdsRoute([nodeRow({ id: CONCEPT, code: "C-RATIO", node_type: "CONCEPT", applicability: null })]),
      partOfEdgesRoute([]),
    ]);
    const tree = await knowledgeTree(d, CONCEPT, false);
    expect(tree.type).toBe("CONCEPT");
  });
});
