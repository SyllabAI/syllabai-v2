/**
 * Pins for the CLA deterministic core — T-MIG-067 tranche-1a.
 * Frozen law sources: ClaLeakagePolicyTest (:1-218) + ClaToolRegistryTest
 * laws + ResourceContext predicates, line-against-line from syllabai-core
 * @ 6cad6ef. Every pin names the frozen line it holds.
 */
import { describe, expect, it } from "bun:test";
import {
  isNoteContext,
  isQuestionContext,
  isQuestionPartContext,
  isTopicContext,
  withLessonAction,
  withNote,
  type ClaResourceContext,
} from "../../src/services/cla/context";
import {
  checkModeAdmission,
  ClaAttemptRequiredError,
  evidenceEligible,
  markSchemeDocumentChunkAllowed,
  schemePointEvidenceAllowed,
  type ClaResponseMode,
} from "../../src/services/cla/leakage-policy";
import {
  enabledFor,
  learnerState,
  learnerStateScope,
  MAX_MISCONCEPTIONS,
  MAX_PREREQUISITES,
  MAX_SPEC_CHAIN,
  ownLearnerStateIsEmpty,
  relatedConcepts,
  specificationContext,
  toolResultSize,
  toolTrace,
  type ClaToolRegistryDeps,
} from "../../src/services/cla/tool-registry";
import { CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE } from "@syllabai/contracts";
import { fakeSql } from "../assessment/helpers";

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const ROOT = "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e00a1";
const TOPIC = "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e00a2";
const LEARNER = "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e00a3";
const QUESTION = "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e00a4";
const PART = "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e00a5";

function kgTopic(attempted: boolean | null = null): ClaResourceContext {
  return {
    kind: "KG_TOPIC",
    reference: TOPIC,
    topicNodeId: TOPIC,
    rootId: ROOT,
    subjectCode: "4CH1",
    topicCode: "IALCHEM2018-U1-T3",
    topicTitle: "Empirical formulae",
    curriculumVersion: { code: "IALCHEM2018", board: "Edexcel", qualification: "International GCSE", status: "CURRENT" },
    validationState: "VALIDATED",
    learnerId: LEARNER,
    resolvedAt: "2026-10-06T06:00:00.000Z",
    questionStem: null,
    questionCommandWord: null,
    questionMarks: 0,
    paperCode: null,
    attempted,
    partLabel: null,
    lessonAction: null,
    noteId: null,
    noteTitle: null,
  };
}

function pastPaper(attempted: boolean): ClaResourceContext {
  return {
    ...kgTopic(),
    kind: "PAST_PAPER_QUESTION",
    reference: QUESTION,
    questionStem: "A sample of iron oxide contains 70 g Fe…",
    questionCommandWord: "Explain",
    questionMarks: 4,
    paperCode: "4CH1-1C",
    attempted,
  };
}

function questionPart(attempted: boolean): ClaResourceContext {
  return { ...pastPaper(attempted), kind: "QUESTION_PART", reference: PART, partLabel: "b-ii", questionMarks: 2 };
}

const chunkItem = (source: string, documentRowId: string | null) =>
  ({
    source,
    documentRowId,
    content: "…",
    documentId: "doc-1",
    documentVersion: 3,
    chunkId: "chunk-1",
    chunkIndex: 0,
    nodeId: null,
    nodeCode: null,
    nodeType: null,
    nodeTitle: null,
  }) as never;

/* ------------------------------------------------------------------ */
/* the ResourceContext predicates (:196-249)                           */
/* ------------------------------------------------------------------ */

describe("cla/context — the frozen predicates", () => {
  it("question-level and part-level anchors are both question contexts (:196-203)", () => {
    expect(isQuestionContext(pastPaper(true))).toBe(true);
    expect(isQuestionContext(questionPart(true))).toBe(true);
    expect(isQuestionContext(kgTopic())).toBe(false);
  });

  it("only QUESTION_PART is a part context (:205-207)", () => {
    expect(isQuestionPartContext(questionPart(true))).toBe(true);
    expect(isQuestionPartContext(pastPaper(true))).toBe(false);
  });

  it("KG_TOPIC / SMART_LESSON / NOTE_SECTION share the topic-anchored spine (:217-224)", () => {
    expect(isTopicContext(kgTopic())).toBe(true);
    expect(isTopicContext({ ...kgTopic(), kind: "SMART_LESSON" })).toBe(true);
    expect(isTopicContext({ ...kgTopic(), kind: "NOTE_SECTION" })).toBe(true);
    expect(isTopicContext(pastPaper(true))).toBe(false);
  });

  it("only NOTE_SECTION is a note context (:226-228)", () => {
    expect(isNoteContext({ ...kgTopic(), kind: "NOTE_SECTION" })).toBe(true);
    expect(isNoteContext(kgTopic())).toBe(false);
  });

  it("the with-copies enrich WITHOUT re-running the gates (:230-249)", () => {
    const action = {
      actionType: "PRACTISE_QUESTIONS",
      reasonCode: "DUE_REVIEW",
      targetNodeId: null,
      targetCode: null,
      targetTitle: null,
      reasonDetail: "the ladder's honest reason",
      servableQuestionCount: 3,
    };
    const enriched = withLessonAction(kgTopic(), action);
    expect(enriched.lessonAction?.reasonCode).toBe("DUE_REVIEW");
    expect(enriched.kind).toBe("KG_TOPIC");
    const noted = withNote({ ...kgTopic(), kind: "NOTE_SECTION" }, "rn_2VnK66PqbvFKdKYt", "Ionic bonds");
    expect(noted.noteId).toBe("rn_2VnK66PqbvFKdKYt");
    expect(noted.noteTitle).toBe("Ionic bonds");
    expect(noted.topicCode).toBe(kgTopic().topicCode); // the spine is untouched
  });
});

/* ------------------------------------------------------------------ */
/* the §7 answer-leakage gate (ClaLeakagePolicy)                       */
/* ------------------------------------------------------------------ */

describe("cla/leakage-policy — mode admission (§7.3/§7.4)", () => {
  it("pre-attempt CHECK on a question context throws BEFORE retrieval or generation", () => {
    expect(() => checkModeAdmission(pastPaper(false), "CHECK")).toThrow(ClaAttemptRequiredError);
    expect(() => checkModeAdmission(questionPart(false), "CHECK")).toThrow(ClaAttemptRequiredError);
  });

  it("post-attempt CHECK is admitted", () => {
    expect(() => checkModeAdmission(pastPaper(true), "CHECK")).not.toThrow();
  });

  it("CHECK on a topic context is not the gate's business (attempted null)", () => {
    expect(() => checkModeAdmission(kgTopic(), "CHECK")).not.toThrow();
  });

  it("the thrown body is the FIXED refusal text (AttemptRequiredException :14-15)", () => {
    try {
      checkModeAdmission(pastPaper(false), "CHECK");
      throw new Error("unreachable");
    } catch (e) {
      expect((e as ClaAttemptRequiredError).message).toBe(CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE);
    }
  });
});

describe("cla/leakage-policy — evidence eligibility (§7.2/§7.4)", () => {
  const modes: ClaResponseMode[] = ["EXPLAIN", "SUMMARIZE", "HINT", "CHECK"];

  it("mark-scheme DOCUMENT chunks never serve on question contexts — any mode, any attempt state", () => {
    for (const mode of modes) {
      for (const ctx of [pastPaper(false), pastPaper(true), questionPart(false), questionPart(true)]) {
        expect(markSchemeDocumentChunkAllowed(ctx, mode)).toBe(false);
        expect(evidenceEligible(ctx, mode, chunkItem("MARK_SCHEME", "row-1"))).toBe(false);
      }
    }
  });

  it("mark-scheme chunks serve on topic contexts (tutor parity)", () => {
    for (const mode of modes) {
      expect(markSchemeDocumentChunkAllowed(kgTopic(), mode)).toBe(true);
      expect(evidenceEligible(kgTopic(), mode, chunkItem("MARK_SCHEME", "row-1"))).toBe(true);
    }
  });

  it("a mark-scheme item WITHOUT a document rowId (the synthesized scheme-point evidence) is not the DOCUMENT exclusion", () => {
    for (const ctx of [pastPaper(true), questionPart(true)]) {
      expect(evidenceEligible(ctx, "CHECK", chunkItem("MARK_SCHEME", null))).toBe(true);
    }
  });

  it("the synthesized scheme-point evidence never enters a HINT, pre- or post-attempt (:69-73)", () => {
    expect(schemePointEvidenceAllowed(pastPaper(true), "HINT")).toBe(false);
    expect(schemePointEvidenceAllowed(pastPaper(false), "HINT")).toBe(false);
    expect(schemePointEvidenceAllowed(pastPaper(true), "CHECK")).toBe(true);
    expect(schemePointEvidenceAllowed(kgTopic(), "CHECK")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* the read-only tool registry (ClaToolRegistry)                       */
/* ------------------------------------------------------------------ */

describe("cla/tool-registry — enablement (§4.1, :96-113)", () => {
  it("all six served kinds enable ALL three tools with every mode — the fixed composition", () => {
    for (const kind of ["KG_TOPIC", "SPECIFICATION_POINT", "PAST_PAPER_QUESTION", "QUESTION_PART", "SMART_LESSON", "NOTE_SECTION"] as const) {
      expect(enabledFor(kind, "EXPLAIN")).toEqual([
        "GET_SPECIFICATION_CONTEXT",
        "GET_RELATED_CONCEPTS",
        "GET_LEARNER_STATE",
      ]);
    }
  });

  it("any other kind is rejected by the REGISTRY, not the caller — the 400 shape", () => {
    expect(() => enabledFor("FREEFORM" as never, "EXPLAIN")).toThrow(
      "context kind not supported by this runtime step: FREEFORM",
    );
  });
});

describe("cla/tool-registry — GET_SPECIFICATION_CONTEXT (:116-189)", () => {
  const tree = {
    id: ROOT,
    code: "4CH1",
    type: "SUBJECT",
    title: "Chemistry",
    description: null,
    validationStatus: "VALIDATED",
    provenance: null,
    applicability: null,
    children: [
      {
        id: "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e00b1",
        code: "IALCHEM2018-U1",
        type: "UNIT",
        title: "Unit 1",
        description: null,
        validationStatus: "VALIDATED",
        provenance: null,
        applicability: null,
        children: [
          {
            id: TOPIC,
            code: "IALCHEM2018-U1-T3",
            type: "TOPIC",
            title: "Empirical formulae",
            description: null,
            validationStatus: "VALIDATED",
            provenance: null,
            applicability: null,
            children: [
              {
                id: "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e00c1",
                code: "IALCHEM2018-U1-T3-X",
                type: "SUBTOPIC",
                title: "NOT on the path",
                description: null,
                validationStatus: "VALIDATED",
                provenance: null,
                applicability: null,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  it("walks the ancestor chain root→unit→topic and backtracks off dead branches", () => {
    const result = specificationContext(kgTopic(), tree);
    expect(result.tool).toBe("GET_SPECIFICATION_CONTEXT");
    expect(result.args).toBe("root=" + ROOT + ",topic=" + TOPIC);
    expect(result.value.map((a) => [a.code, a.depth])).toEqual([
      ["4CH1", 0],
      ["IALCHEM2018-U1", 1],
      ["IALCHEM2018-U1-T3", 2],
    ]);
    expect(toolResultSize(result.value)).toBe(3);
  });

  it("a topic outside the tree yields an empty chain (the caller 404s the context)", () => {
    const foreign = { ...kgTopic(), topicNodeId: QUESTION };
    expect(specificationContext(foreign, tree).value).toEqual([]);
  });
});

describe("cla/tool-registry — GET_RELATED_CONCEPTS (:125-136)", () => {
  const prereqRows = Array.from({ length: 15 }, (_, i) => ({
    id: "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0d" + String(i).padStart(2, "0"),
    code: "P" + i,
    type: "TOPIC",
    title: "Prereq " + i,
    depth: i + 1,
  }));
  const misc0Id = "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0e00";
  const miscRows = Array.from({ length: 8 }, (_, i) => ({
    id: i === 0 ? misc0Id : "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0e" + String(i).padStart(2, "0"),
    code: "M" + i,
    node_type: "MISCONCEPTION",
    title: "Misconception " + i,
    description: null,
    validation_status: "VALIDATED",
    provenance: null,
    applicability: null,
  }));

  function depsWith(): ClaToolRegistryDeps {
    // param-aware fakeSql per the shared helper (053's read laws ride it):
    // node404 must see the anchored topic; the closure + node fetches return
    // the 15-deep chain; the MISCONCEPTION_OF join returns the 8 attachments.
    const nodeRow = {
      id: TOPIC,
      code: "IALCHEM2018-U1-T3",
      node_type: "TOPIC",
      title: "Empirical formulae",
      description: null,
      validation_status: "VALIDATED",
      provenance: null,
      applicability: null,
    };
    return {
      sql: fakeSql([
        {
          match: /from knowledge_nodes where id = \? ::uuid$/,
          rows: [nodeRow],
        },
        {
          match: /with recursive prereq as/,
          rows: prereqRows.map((p) => ({ node_id: p.id, depth: p.depth })),
        },
        {
          match: /from knowledge_nodes where id = any\( \? ::uuid\[\]\)$/,
          rows: [],
          rowsFor: (params: unknown[]) => {
            const ids = (params[0] as string[]) ?? [];
            return prereqRows
              .filter((p) => ids.includes(p.id))
              .map((p) => ({
                id: p.id,
                code: p.code,
                node_type: p.type,
                title: p.title,
                description: null,
                validation_status: "VALIDATED",
                provenance: null,
                applicability: null,
              }));
          },
        },
        {
          match: /from knowledge_edges e join knowledge_nodes s on s\.id = e\.source_node_id where e\.target_node_id = \? ::uuid and e\.relation_type = 'MISCONCEPTION_OF'/,
          rows: miscRows,
        },
      ]) as never,
      clock: { newId: () => "id", now: () => new Date(0) },
      learnerModel: {
        skillStates: () => Promise.resolve([]),
        misconceptionReadings: () => Promise.resolve([]),
      },
    };
  }

  it("bounds the chain at 12 and misconceptions at 6, in the read order", async () => {
    const result = await relatedConcepts(depsWith(), kgTopic());
    expect(result.args).toBe("topic=" + TOPIC);
    expect(result.value.prerequisites.length).toBe(MAX_PREREQUISITES);
    expect(result.value.misconceptions.length).toBe(MAX_MISCONCEPTIONS);
    expect(result.value.misconceptions[0]).toEqual({ nodeId: misc0Id, title: "Misconception 0" });
    expect(toolResultSize(result.value)).toBe(MAX_PREREQUISITES + MAX_MISCONCEPTIONS);
  });
});

describe("cla/tool-registry — GET_LEARNER_STATE (:139-151)", () => {
  const scope = learnerStateScope(TOPIC, [
    { id: "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0d01", code: "P1", type: "TOPIC", title: "Prereq", depth: 1 },
  ]);

  it("the scope is the anchored topic + its prerequisite ids (:192-199)", () => {
    expect(scope.has(TOPIC)).toBe(true);
    expect(scope.has("6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0d01")).toBe(true);
    expect(scope.size).toBe(2);
  });

  it("reads the learner's OWN state ONLY, filtered to the scope — no fabrication", async () => {
    const outside = "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0f01";
    const deps: ClaToolRegistryDeps = {
      sql: (() => Promise.resolve([])) as never,
      clock: { newId: () => "id", now: () => new Date(0) },
      learnerModel: {
        skillStates: (learnerId: string) => {
          expect(learnerId).toBe(LEARNER); // SELF only — no cross-learner read path
          return Promise.resolve([
            { nodeId: TOPIC, mastery: 0.4, attempts: 2, correctCount: 1, lastPracticedAt: new Date(0), proceduralFluencyGap: null },
            { nodeId: outside, mastery: 0.9, attempts: 9, correctCount: 9, lastPracticedAt: new Date(0), proceduralFluencyGap: null },
          ] as never);
        },
        misconceptionReadings: () =>
          Promise.resolve([
            { misconceptionNodeId: "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0d01", effective: 0.42 },
            { misconceptionNodeId: outside, effective: 0.9 },
          ] as never),
      },
    };
    const result = await learnerState(deps, LEARNER, scope);
    expect(result.args).toBe("learner=SELF,scope=2-nodes");
    expect(result.value.skills.map((s) => s.nodeId)).toEqual([TOPIC]);
    expect(result.value.misconceptions.map((m) => m.misconceptionNodeId)).toEqual([
      "6b8fc14f-9d92-4a0e-ae7c-7f6d9fd0e0d01",
    ]);
    expect(ownLearnerStateIsEmpty(result.value)).toBe(false);
  });

  it("an unmeasured topic yields the honest empty result", async () => {
    const deps: ClaToolRegistryDeps = {
      sql: (() => Promise.resolve([])) as never,
      clock: { newId: () => "id", now: () => new Date(0) },
      learnerModel: {
        skillStates: () => Promise.resolve([]),
        misconceptionReadings: () => Promise.resolve([]),
      },
    };
    const result = await learnerState(deps, LEARNER, scope);
    expect(ownLearnerStateIsEmpty(result.value)).toBe(true);
    expect(toolResultSize(result.value)).toBe(0);
  });
});

describe("cla/tool-registry — the audit trace (§4.4)", () => {
  it("toolTrace carries the size law and never negative latencies", () => {
    const t = toolTrace("GET_LEARNER_STATE", "learner=SELF,scope=2-nodes", { skills: [{}], misconceptions: [{}] }, 7);
    expect(t.resultSize).toBe(2);
    expect(t.latencyMs).toBe(7);
    expect(toolTrace("GET_LEARNER_STATE", "args", { skills: [], misconceptions: [] }, -5).latencyMs).toBe(0);
  });

  it("the depth cap is the frozen 8", () => {
    expect(MAX_SPEC_CHAIN).toBe(8);
  });
});
