/**
 * Pins for the CLA context resolver — T-MIG-069 tranche-1b.
 * Frozen law source: ClaContextResolverTest (:1-574) + the
 * ClaContextResolver spine laws, line-against-line from syllabai-core
 * @ 6cad6ef. Every pin names the frozen test/law it holds. The frozen
 * SMART_LESSON / NOTE_SECTION resolver pins defer with their branches
 * (T-MIG-053 t3/t4 gate); the deferral pin at the tail documents the
 * runtime-step surface of record.
 */
import { describe, expect, it } from "bun:test";
import { buildClaContextResolver } from "../../src/services/cla/context-resolver";
import { fakeSql, type Route } from "../assessment/helpers";
import { NotFoundException } from "../../src/services/identity/errors";

/* ------------------------------------------------------------------ */
/* fixtures — the frozen setUp graph (ClaContextResolverTest :41-99)   */
/* ------------------------------------------------------------------ */

const SUBJECT = "b0000000-0000-4000-8000-000000000001";
const ROOT = "b0000000-0000-4000-8000-000000000002";
const UNIT = "b0000000-0000-4000-8000-000000000003";
const TOPIC = "b0000000-0000-4000-8000-000000000004";
const LEARNER = "b0000000-0000-4000-8000-000000000005";
const QUESTION = "b0000000-0000-4000-8000-000000000006";
const VERSION = "b0000000-0000-4000-8000-000000000007";
const PART = "b0000000-0000-4000-8000-000000000008";
const PAPER = "b0000000-0000-4000-8000-000000000009";
const OTHER_SUBJECT = "b0000000-0000-4000-8000-00000000000a";
const CONCEPT = "b0000000-0000-4000-8000-00000000000b";
const SUPERSEDED = "b0000000-0000-4000-8000-00000000000c";

const nodeRow = (id: string, code: string, type: string, title: string, status = "VALIDATED") => ({
  id,
  code,
  node_type: type,
  title,
  description: null,
  validation_status: status,
  provenance: null,
  applicability: null,
});

const subjectJoinedRow = (id: string, kgNodeId: string | null) => ({
  id,
  curriculum_version_id: "b0000000-0000-4000-8000-0000000000ff",
  code: "4CH1",
  name: "Chemistry",
  knowledge_node_id: kgNodeId,
  created_at: "2026-01-01T00:00:00.000Z",
  v_id: "b0000000-0000-4000-8000-0000000000ff",
  board: "Edexcel",
  qualification: "IAL",
  v_code: "IALCHEM2018",
  v_title: "International Advanced Level Chemistry",
  v_status: "ACTIVE",
  v_created_at: "2026-01-01T00:00:00.000Z",
});

/** the question row the resolver's own repo read returns. */
const questionShortRow = {
  id: QUESTION,
  active: true,
  exam_paper_id: PAPER,
  primary_topic_node_id: TOPIC,
  command_word: "Explain",
};

/** the question row ServableQuestions.findById reads (the serving gate). */
const servableQuestionRow = {
  id: QUESTION,
  external_ref: "q-1",
  question_type: "STRUCTURED",
  stem: "Explain why ionic compounds conduct when molten.",
  marks: 6,
  difficulty: 2,
  expected_time_seconds: 120,
  command_word: "Explain",
  primary_topic_node_id: TOPIC,
  exam_paper_id: PAPER,
  provenance: "SEED_DEMO",
  active: true,
};

const versionRow = (id: string, version: number, validationState = "VALIDATED") => ({
  id,
  question_id: QUESTION,
  version,
  stem: "Explain why ionic compounds conduct when molten.",
  marks: 6,
  command_word: null as string | null,
  validation_state: validationState,
});

const servableVersionRow = (validationState: string) => ({
  id: VERSION,
  question_id: QUESTION,
  version: 2,
  stem: "Explain why ionic compounds conduct when molten.",
  marks: 6,
  difficulty: 2,
  expected_time_seconds: 120,
  command_word: null,
  validation_state: validationState,
  part_id: null,
  part_label: null,
  part_prompt: null,
  part_command_word: null,
  part_marks: null,
  part_ordering: null,
});

const partRow = {
  id: PART,
  question_version_id: VERSION,
  label: "a",
  prompt: "State why ionic compounds conduct when molten.",
  command_word: "State",
  marks: 2,
};

const paperRow = { id: PAPER, subject_id: SUBJECT, paper_code: "4CH0/2C" };

/* ------------------------------------------------------------------ */
/* the fakeSql route set (query text after whitespace collapse)        */
/* ------------------------------------------------------------------ */

interface Overrides {
  /** the AttemptRepository read — frozen default false (:330). */
  attempted?: boolean;
  /** the KnowledgeNode entity status the gate reads for TOPIC (:131-135). */
  topicEntityStatus?: string;
  /** the current version is a DIFFERENT row — the superseded-version gate. */
  currentVersionId?: string;
  /** the servable projection's current version state (the serving gate). */
  servableVersionState?: string;
  /** the subject the rootId resolves to (null = unresolvable root). */
  subjectForRootId?: string | null;
  /** question active flag (the :304-306 active filter). */
  questionActive?: boolean;
}

function routes(o: Overrides = {}): Route[] {
  const currentVersionId = o.currentVersionId ?? VERSION;
  const subjectForRootId = o.subjectForRootId === undefined ? SUBJECT : o.subjectForRootId;
  return [
    {
      // knowledgeTree node404 — the tree always builds from the subject root
      match: /select id, code, node_type, title, description, validation_status, provenance, applicability from knowledge_nodes where id = \? ::uuid/,
      rows: [nodeRow(ROOT, "IALCHEM2018", "SUBJECT", "IAL Chemistry")],
    },
    {
      // knowledgeTree subtree CTE (lowercase)
      match: /with recursive subtree as/,
      rows: [{ id: ROOT }, { id: UNIT }, { id: TOPIC }, { id: CONCEPT }],
    },
    {
      // knowledgeTree batched nodes (the registry content — the SUGGESTED
      // concept child of :247-259 rides the tree in every test; harmless
      // for the pins that never query its code)
      match: /from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
      rows: [],
      rowsFor: (params: unknown[]) => {
        const ids = (params[0] as string[]) ?? [];
        return [
          nodeRow(ROOT, "IALCHEM2018", "SUBJECT", "IAL Chemistry"),
          nodeRow(UNIT, "IALCHEM2018-U1", "UNIT", "Unit 1"),
          nodeRow(TOPIC, "IALCHEM2018-U1-T3", "TOPIC", "Bonding and structure"),
          nodeRow(CONCEPT, "CONCEPT-x", "CONCEPT", "retrieval-graph concept", "SUGGESTED"),
        ].filter((n) => ids.includes(n.id));
      },
    },
    {
      // knowledgeTree PART_OF edges (children grouped by target)
      match: /from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = any\( \? ::uuid\[\]\) and e\.relation_type = 'PART_OF'$/,
      rows: [],
      rowsFor: (params: unknown[]) => {
        const ids = (params[0] as string[]) ?? [];
        return [
          { source_node_id: UNIT, target_node_id: ROOT, source_code: "IALCHEM2018-U1" },
          { source_node_id: TOPIC, target_node_id: UNIT, source_code: "IALCHEM2018-U1-T3" },
          { source_node_id: CONCEPT, target_node_id: TOPIC, source_code: "CONCEPT-x" },
        ].filter((e) => ids.includes(e.target_node_id));
      },
    },
    {
      // subjects.findByKnowledgeNodeId (the resolver's own read)
      match: /from subjects s join curriculum_versions v on v\.id = s\.curriculum_version_id where s\.knowledge_node_id = \?$/,
      rows: [],
      rowsFor: (params: unknown[]) => {
        const rootId = params[0] as string;
        const kgId = rootId === ROOT ? ROOT : rootId;
        if (subjectForRootId === null) return [];
        // the foreign-root override: the root resolves to ANOTHER subject
        return [subjectJoinedRow(rootId === ROOT ? subjectForRootId : SUBJECT, kgId)];
      },
    },
    {
      // SubjectsRepository.findById (the paper-subject spine read)
      match: /from subjects s join curriculum_versions v on v\.id = s\.curriculum_version_id where s\.id = \?$/,
      rows: [subjectJoinedRow(SUBJECT, ROOT)],
    },
    {
      // the gate's entity read (KnowledgeNodeRepository.findById port)
      match: /select code, title, validation_status from knowledge_nodes where id = \? ::uuid$/,
      rows: [],
      rowsFor: (params: unknown[]) => {
        const id = params[0] as string;
        if (id === TOPIC) {
          return [
            {
              code: "IALCHEM2018-U1-T3",
              title: "Bonding and structure",
              validation_status: o.topicEntityStatus ?? "VALIDATED",
            },
          ];
        }
        if (id === CONCEPT) {
          return [
            {
              code: "CONCEPT-x",
              title: "retrieval-graph concept",
              validation_status: "SUGGESTED",
            },
          ];
        }
        return [];
      },
    },
    {
      // the resolver's current-version read (no parts join)
      match: /from question_versions v where v\.question_id = \? order by v\.version desc$/,
      rows: [versionRow(currentVersionId, currentVersionId === SUPERSEDED ? 3 : 2)],
    },
    {
      // the part's version read (the canonical FK)
      match: /from question_versions v where v\.id = \?$/,
      rows: [versionRow(VERSION, 2)],
    },
    {
      // the resolver's question read (the active filter lives at :304-306)
      match: /select q\.id, q\.active, q\.exam_paper_id, q\.primary_topic_node_id, q\.command_word from questions q where q\.id = \?$/,
      rows: [{ ...questionShortRow, active: o.questionActive ?? true }],
    },
    {
      // ServableQuestions.findById question read (the gate's own)
      match: /select q\.id, q\.external_ref, q\.question_type, q\.stem, q\.marks, q\.difficulty, q\.expected_time_seconds, q\.command_word, q\.primary_topic_node_id, q\.exam_paper_id, q\.provenance, q\.active from questions q where q\.id = \?$/,
      rows: [servableQuestionRow],
    },
    {
      // ServableQuestions.blockingPaperIds (the V20 paper gate)
      match: /select p\.id from exam_papers p where p\.validation_state in \('REJECTED', 'FLAGGED'\)/,
      rows: [],
    },
    {
      // ServableQuestions.findById version read (parts join)
      match: /from question_versions v left join question_parts p on p\.question_version_id = v\.id where v\.question_id = \? order by v\.version desc$/,
      rows: [servableVersionRow(o.servableVersionState ?? "VALIDATED")],
    },
    {
      // ServableQuestions.optionsFor
      match: /from question_options o where o\.question_id = any\( \? ::uuid\[\]\) order by o\.question_id, o\.ordering$/,
      rows: [],
    },
    {
      // ServableQuestions.specPointRefs
      match: /from question_spec_points qsp join knowledge_nodes kn on kn\.id = qsp\.spec_point_node_id where qsp\.question_id = any\( \? ::uuid\[\]\)$/,
      rows: [],
    },
    {
      // taxonomy.subtreeIds root existence check (the 404-first law)
      match: /select id from knowledge_nodes where id = \?$/,
      rows: [{ id: ROOT }],
    },
    {
      // taxonomy.subtreeIds CTE (uppercase WITH — the questions module's port)
      match: /WITH RECURSIVE subtree as/,
      rows: [{ id: ROOT }, { id: UNIT }, { id: TOPIC }],
    },
    {
      // the resolver's part read (param-aware: only the fixture part exists)
      match: /from question_parts p where p\.id = \?$/,
      rows: [],
      rowsFor: (params: unknown[]) => ((params[0] as string) === PART ? [partRow] : []),
    },
    {
      // the resolver's paper read
      match: /select p\.id, p\.subject_id, p\.paper_code from exam_papers p where p\.id = \?$/,
      rows: [paperRow],
    },
    {
      // AttemptRepository.existsByLearnerIdAndQuestionId
      match: /select 1 from attempts where learner_id = \? and question_id = \? limit 1$/,
      rows: [],
      rowsFor: (params: unknown[]) =>
        o.attempted === true && (params[1] as string) === QUESTION ? [{ 1: 1 }] : [],
    },
  ];
}

const build = (o: Overrides = {}) =>
  buildClaContextResolver({
    sql: fakeSql(routes(o)) as never,
    clock: { newId: () => "id", now: () => new Date(0) },
  });

/* ------------------------------------------------------------------ */
/* KG_TOPIC — the curriculum spine (frozen :100-160)                   */
/* ------------------------------------------------------------------ */

describe("ClaContextResolver — KG_TOPIC", () => {
  it("resolves a VALIDATED topic inside the subject subtree with server-side curriculum identity", async () => {
    const resolver = build();
    const context = await resolver.resolveKgTopic(ROOT, TOPIC, LEARNER);
    expect(context.kind).toBe("KG_TOPIC");
    expect(context.reference).toBe(TOPIC);
    expect(context.rootId).toBe(ROOT);
    expect(context.subjectCode).toBe("4CH1");
    expect(context.topicCode).toBe("IALCHEM2018-U1-T3");
    // curriculum identity resolved from the owning subject, never client-supplied
    expect(context.curriculumVersion.code).toBe("IALCHEM2018");
    expect(context.curriculumVersion.board).toBe("Edexcel");
    expect(context.curriculumVersion.status).toBe("ACTIVE");
    expect(context.validationState).toBe("VALIDATED");
    expect(context.learnerId).toBe(LEARNER);
    expect(context.resolvedAt).not.toBeNull();
  });

  it("fail-closed: a topic outside the subject subtree is a 404, not a cross-subject hop", async () => {
    const resolver = build();
    const outside = "b9999999-9999-4999-8999-999999999999";
    await expect(resolver.resolveKgTopic(ROOT, outside, LEARNER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("validation gate: non-VALIDATED content fails closed, indistinguishable from unresolvable", async () => {
    const resolver = build({ topicEntityStatus: "SUGGESTED" });
    await expect(resolver.resolveKgTopic(ROOT, TOPIC, LEARNER)).rejects.toThrow(
      "validated curriculum topic",
    );
  });

  it("fail-closed: a root that is not a subject root is a 404", async () => {
    const resolver = build({ subjectForRootId: null });
    const unknownRoot = "b8888888-8888-4888-8888-888888888888";
    await expect(resolver.resolveKgTopic(unknownRoot, TOPIC, LEARNER)).rejects.toThrow(
      "subject root",
    );
  });
});

/* ------------------------------------------------------------------ */
/* SPECIFICATION_POINT — the syllabus-browser anchor (frozen :162-263) */
/* ------------------------------------------------------------------ */

describe("ClaContextResolver — SPECIFICATION_POINT", () => {
  it("resolves by spec-point code to a VALIDATED node (stripped, not guessed)", async () => {
    const resolver = build();
    const context = await resolver.resolveSpecificationPoint(
      ROOT,
      " IALCHEM2018-U1-T3 ",
      LEARNER,
    );
    expect(context.kind).toBe("SPECIFICATION_POINT");
    expect(context.reference).toBe(TOPIC);
    expect(context.topicNodeId).toBe(TOPIC);
    expect(context.topicCode).toBe("IALCHEM2018-U1-T3");
    expect(context.subjectCode).toBe("4CH1");
    expect(context.validationState).toBe("VALIDATED");
    expect(context.curriculumVersion.code).toBe("IALCHEM2018");
  });

  it("fail-closed: unknown code is a 404, never a guess", async () => {
    const resolver = build();
    await expect(
      resolver.resolveSpecificationPoint(ROOT, "IALCHEM2018-U1-T99", LEARNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("fail-closed: another subject's spec code is a 404", async () => {
    const resolver = build();
    await expect(
      resolver.resolveSpecificationPoint(ROOT, "WCH11-T1.1", LEARNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("validation gate: a code on non-VALIDATED content fails closed", async () => {
    const resolver = build();
    await expect(
      resolver.resolveSpecificationPoint(ROOT, "CONCEPT-x", LEARNER),
    ).rejects.toThrow("validated");
  });
});

/* ------------------------------------------------------------------ */
/* QUESTION_PART — the canonical-FK anchor (frozen :304-435)           */
/* ------------------------------------------------------------------ */

describe("ClaContextResolver — QUESTION_PART", () => {
  it("resolves through part → version → question → subject → topic", async () => {
    const resolver = build();
    const context = await resolver.resolveQuestionPart(PART, null, LEARNER);
    expect(context.kind).toBe("QUESTION_PART");
    expect(context.reference).toBe(PART);
    expect(context.topicNodeId).toBe(TOPIC);
    expect(context.rootId).toBe(ROOT);
    expect(context.subjectCode).toBe("4CH1");
    expect(context.topicCode).toBe("IALCHEM2018-U1-T3");
    // the PART is what the learner is looking at: label, prompt, part marks
    expect(context.partLabel).toBe("a");
    expect(context.questionStem).toContain("ionic compounds conduct when molten");
    expect(context.questionMarks).toBe(2);
    expect(context.paperCode).toBe("4CH0/2C");
    expect(context.attempted).toBe(false);
    expect(context.validationState).toBe("VALIDATED");
    expect(context.curriculumVersion.code).toBe("IALCHEM2018");
    // command-word precedence: part.commandWord overrides the question's
    expect(context.questionCommandWord).toBe("State");
  });

  it("fail-closed: unknown part is a 404, no existence oracle", async () => {
    const resolver = build();
    const unknown = "b7777777-7777-4777-8777-777777777777";
    await expect(resolver.resolveQuestionPart(unknown, null, LEARNER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("relationship gate: a part of a superseded version is a 404", async () => {
    const resolver = build({ currentVersionId: SUPERSEDED });
    await expect(resolver.resolveQuestionPart(PART, null, LEARNER)).rejects.toThrow(
      "current version",
    );
  });

  it("fail-closed: unservable question is an indistinguishable 404", async () => {
    const resolver = build({ servableVersionState: "DRAFT" });
    await expect(resolver.resolveQuestionPart(PART, null, LEARNER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("fail-closed: a root of ANOTHER subject is a foreign-subject 404", async () => {
    const resolver = build({ subjectForRootId: OTHER_SUBJECT });
    await expect(resolver.resolveQuestionPart(PART, ROOT, LEARNER)).rejects.toThrow(
      "in this subject",
    );
  });

  it("fail-closed: a supplied root that is no subject is a 404", async () => {
    const resolver = build({ subjectForRootId: null });
    const unknownRoot = "b8888888-8888-4888-8888-888888888888";
    await expect(resolver.resolveQuestionPart(PART, unknownRoot, LEARNER)).rejects.toThrow(
      "subject root",
    );
  });
});

/* ------------------------------------------------------------------ */
/* PAST_PAPER_QUESTION — the question-level anchor (frozen :302-321 +  */
/* the shared spine; the frozen unit coverage rides ClaFlowIT, the v2  */
/* port pins the spine laws at unit level)                             */
/* ------------------------------------------------------------------ */

describe("ClaContextResolver — PAST_PAPER_QUESTION", () => {
  it("resolves through the serving gate to the question anchor with the attempt state", async () => {
    const resolver = build({ attempted: true });
    const context = await resolver.resolvePastPaperQuestion(QUESTION, LEARNER);
    expect(context.kind).toBe("PAST_PAPER_QUESTION");
    expect(context.reference).toBe(QUESTION);
    expect(context.topicNodeId).toBe(TOPIC);
    expect(context.rootId).toBe(ROOT);
    expect(context.subjectCode).toBe("4CH1");
    expect(context.topicCode).toBe("IALCHEM2018-U1-T3");
    // the stem is the current version's (the served reading)
    expect(context.questionStem).toContain("ionic compounds conduct when molten");
    // command-word precedence: version.commandWord ?: question.commandWord
    expect(context.questionCommandWord).toBe("Explain");
    // partMarks null → the version's marks
    expect(context.questionMarks).toBe(6);
    expect(context.paperCode).toBe("4CH0/2C");
    expect(context.attempted).toBe(true);
    expect(context.partLabel).toBeNull();
    expect(context.validationState).toBe("VALIDATED");
  });

  it("fail-closed: an inactive question is a 404, no existence oracle", async () => {
    const resolver = build({ questionActive: false });
    await expect(resolver.resolvePastPaperQuestion(QUESTION, LEARNER)).rejects.toThrow(
      "servable question",
    );
  });

  it("fail-closed: unservable question is an indistinguishable 404", async () => {
    const resolver = build({ servableVersionState: "DRAFT" });
    await expect(
      resolver.resolvePastPaperQuestion(QUESTION, LEARNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/* ------------------------------------------------------------------ */
/* the runtime-step surface of record (the deferral disclosure)        */
/* ------------------------------------------------------------------ */

describe("ClaContextResolver — runtime step", () => {
  it("serves exactly the four dependency-landed kinds; SMART_LESSON and NOTE_SECTION defer to the 053 t3/t4 gate", () => {
    const resolver = build() as unknown as Record<string, unknown>;
    expect(typeof resolver.resolveKgTopic).toBe("function");
    expect(typeof resolver.resolveSpecificationPoint).toBe("function");
    expect(typeof resolver.resolvePastPaperQuestion).toBe("function");
    expect(typeof resolver.resolveQuestionPart).toBe("function");
    // the frozen resolveSmartLesson (:209-222) / resolveNoteSection
    // (:252-282) have NO v2 runtime-step surface yet — the route dispatch
    // (tranche-2) refuses the kinds with the fixed 400 (closed enum, §1)
    expect(resolver.resolveSmartLesson).toBeUndefined();
    expect(resolver.resolveNoteSection).toBeUndefined();
  });
});
