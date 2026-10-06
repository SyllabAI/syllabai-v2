/**
 * Contract pins for the Wave-3 assessment contracts (T-MIG-018; filed as T-MIG-006, renumbered R0-REPAIR-2).
 *
 * UNIT-level accept/reject pins derived from the frozen Java constraints
 * (jakarta.validation + Hibernate Validator + Jackson Boot defaults) — the
 * schema's regression net. They do NOT replace golden-master capture
 * (GOLDEN_MASTER.md §2); they make the contract boundary reviewable before
 * the T-MIG-030 port and the Wave-3 capture tranche land.
 *
 * Rule under test: the accept/reject SET must equal the Java core's for
 * every payload class the DTOs constrain (index.ts rules 1–3). Where a
 * behavior is a CAPTURED-BEHAVIOUR FLAG rather than a declared constraint
 * (null parts → controller NPE → 500; Jackson scalar→boolean coercion),
 * the pin documents the schema's chosen side and points at the flag.
 */
import { describe, expect, test } from "bun:test";
import {
  answerMarkingStateSchema,
  attemptHistoryViewSchema,
  attemptMarkingStateSchema,
  attemptResultViewSchema,
  attemptHistoryParamsSchema,
  examPaperDetailResponseSchema,
  examPaperIdPathSchema,
  examPapersListParamsSchema,
  markSchemeRevealViewSchema,
  partAnswerRequestSchema,
  partSelfMarkSchema,
  questionFamilyViewSchema,
  questionIdPathSchema,
  questionProvenanceSchema,
  questionTopicTaxonomyViewSchema,
  questionsListParamsSchema,
  selfMarkPathSchema,
  selfMarkRequestSchema,
  selfMarkViewSchema,
  studentQuestionViewSchema,
  structuredAttemptResultViewSchema,
  structuredSubmitRequestSchema,
  submitAnswerRequestSchema,
  teacherQuestionViewSchema,
} from "./assessment";

const UUID = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";

const OK_MCQ_SUBMIT = {
  questionId: UUID,
  chosenOptionId: UUID2,
  responseTimeMs: 42000,
  selfDoubtFlag: true,
  timedCondition: false,
};

const OK_STRUCTURED_SUBMIT = {
  questionId: UUID,
  partAnswers: [{ partId: UUID2, answerText: "The answer, with $x^2$ inline." }],
  responseTimeMs: 61000,
  confidence: 4,
};

// ── SubmitAnswerRequest ─────────────────────────────────────────────────────

describe("SubmitAnswerRequest — @NotNull UUIDs", () => {
  test("accepts the minimal MCQ submission", () => {
    expect(submitAnswerRequestSchema.safeParse(OK_MCQ_SUBMIT).success).toBe(true);
  });

  test("rejects missing/null questionId and chosenOptionId (@NotNull)", () => {
    const { questionId: _q, ...noQuestion } = OK_MCQ_SUBMIT;
    const { chosenOptionId: _c, ...noOption } = OK_MCQ_SUBMIT;
    expect(submitAnswerRequestSchema.safeParse(noQuestion).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, questionId: null }).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse(noOption).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, chosenOptionId: null }).success).toBe(false);
  });

  test("rejects non-UUID id shapes (Jackson UUID conversion would 400)", () => {
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, questionId: "not-a-uuid" }).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, chosenOptionId: 12345 }).success).toBe(false);
  });
});

describe("SubmitAnswerRequest — responseTimeMs (@NotNull @Min(0) Long)", () => {
  test("accepts 0 and a beyond-2^53 long (int64 note; parity is integral + ≥0)", () => {
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, responseTimeMs: 0 }).success).toBe(true);
    expect(
      submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, responseTimeMs: 9007199254740992 }).success,
    ).toBe(true);
  });

  test("rejects negative, fractional, null and absent", () => {
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, responseTimeMs: -1 }).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, responseTimeMs: 1.5 }).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, responseTimeMs: null }).success).toBe(false);
    const { responseTimeMs: _r, ...without } = OK_MCQ_SUBMIT;
    expect(submitAnswerRequestSchema.safeParse(without).success).toBe(false);
  });
});

describe("SubmitAnswerRequest — confidence (@Min(1) @Max(5) Integer, NO @NotNull)", () => {
  test("accepts absent and null — jakarta @Min/@Max ignore null", () => {
    expect(submitAnswerRequestSchema.safeParse(OK_MCQ_SUBMIT).success).toBe(true);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, confidence: null }).success).toBe(true);
  });

  test("accepts the boundaries 1 and 5, rejects 0 and 6", () => {
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, confidence: 1 }).success).toBe(true);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, confidence: 5 }).success).toBe(true);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, confidence: 0 }).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, confidence: 6 }).success).toBe(false);
  });
});

describe("SubmitAnswerRequest — primitive booleans (Jackson Boot default)", () => {
  test("absent AND null both bind to false (FAIL_ON_NULL_FOR_PRIMITIVES disabled)", () => {
    const absent = submitAnswerRequestSchema.parse({ ...OK_MCQ_SUBMIT, selfDoubtFlag: undefined, timedCondition: undefined });
    expect(absent.selfDoubtFlag).toBe(false);
    expect(absent.timedCondition).toBe(false);
    const nulled = submitAnswerRequestSchema.parse({ ...OK_MCQ_SUBMIT, selfDoubtFlag: null, timedCondition: null });
    expect(nulled.selfDoubtFlag).toBe(false);
    expect(nulled.timedCondition).toBe(false);
  });

  test("accepts real booleans; REJECTS the string \"true\" — coercion is the port's binding shim (header note)", () => {
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, selfDoubtFlag: false }).success).toBe(true);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, selfDoubtFlag: "true" }).success).toBe(false);
    expect(submitAnswerRequestSchema.safeParse({ ...OK_MCQ_SUBMIT, selfDoubtFlag: 1 }).success).toBe(false);
  });
});

// ── PartAnswerRequest + StructuredSubmitRequest ─────────────────────────────

describe("PartAnswerRequest — answerText (@Size(max=4000), nullable)", () => {
  test("accepts empty string and null (skipped part)", () => {
    expect(partAnswerRequestSchema.safeParse({ partId: UUID2, answerText: "" }).success).toBe(true);
    expect(partAnswerRequestSchema.safeParse({ partId: UUID2, answerText: null }).success).toBe(true);
    expect(partAnswerRequestSchema.safeParse({ partId: UUID2 }).success).toBe(true);
  });

  test("accepts exactly 4000 UTF-16 units, rejects 4001 (Java String.length parity)", () => {
    expect(partAnswerRequestSchema.safeParse({ partId: UUID2, answerText: "a".repeat(4000) }).success).toBe(true);
    expect(partAnswerRequestSchema.safeParse({ partId: UUID2, answerText: "a".repeat(4001) }).success).toBe(false);
  });

  test("rejects missing/null partId (@NotNull UUID)", () => {
    expect(partAnswerRequestSchema.safeParse({ answerText: "x" }).success).toBe(false);
    expect(partAnswerRequestSchema.safeParse({ partId: null, answerText: "x" }).success).toBe(false);
  });
});

describe("StructuredSubmitRequest — partAnswers (@NotEmpty @Valid)", () => {
  test("accepts a valid multi-part submission", () => {
    expect(structuredSubmitRequestSchema.safeParse(OK_STRUCTURED_SUBMIT).success).toBe(true);
  });

  test("rejects missing, null and empty partAnswers (@NotEmpty: null AND [] fail)", () => {
    const { partAnswers: _p, ...without } = OK_STRUCTURED_SUBMIT;
    expect(structuredSubmitRequestSchema.safeParse(without).success).toBe(false);
    expect(structuredSubmitRequestSchema.safeParse({ ...OK_STRUCTURED_SUBMIT, partAnswers: null }).success).toBe(false);
    expect(structuredSubmitRequestSchema.safeParse({ ...OK_STRUCTURED_SUBMIT, partAnswers: [] }).success).toBe(false);
  });

  test("cascades element constraints (@Valid): a bad answerText inside fails", () => {
    expect(
      structuredSubmitRequestSchema.safeParse({
        ...OK_STRUCTURED_SUBMIT,
        partAnswers: [{ partId: UUID2, answerText: "a".repeat(4001) }],
      }).success,
    ).toBe(false);
  });
});

// ── SelfMarkRequest (LearnerSelfMarkController boundary) ────────────────────

describe("SelfMarkRequest — the boundary's accept/reject set", () => {
  const OK_SELF_MARK = { parts: [{ partId: UUID, marksAwarded: 2 }, { partId: UUID2, marksAwarded: 0 }] };

  test("accepts a valid two-part self-mark (0 and 99 bind like any int — the range is no longer a bind law)", () => {
    expect(selfMarkRequestSchema.safeParse(OK_SELF_MARK).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: UUID, marksAwarded: 99 }] }).success).toBe(true);
  });

  test("T-MIG-073: accepts marksAwarded -1 and 100 (the DEAD @Min(0)/@Max(99) removed from the bind law — no @Valid cascade on the bare List, SelfMarkRequest :59; Jackson binds any int; the range is the SERVICE bound loop's 409, LearnerSelfMarkService :113-121)", () => {
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: UUID, marksAwarded: -1 }] }).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: UUID, marksAwarded: 100 }] }).success).toBe(true);
  });

  test("T-MIG-073 residual (disclosed): any JS int binds, including beyond int32 (the Jackson-Integer coercion class — frozen would 400 HttpMessageNotReadable; register-only, unreachable by capture)", () => {
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: UUID, marksAwarded: 2 ** 40 }] }).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: UUID, marksAwarded: -(2 ** 40) }] }).success).toBe(true);
  });

  test("T-MIG-059 (F-B): null/absent element fields BIND (the @NotNull/:55 and @Min/:56 constraints are dead — no @Valid cascade on the bare List, SelfMarkRequest :59; Jackson binds null AND absent as null)", () => {
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: UUID, marksAwarded: null }] }).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: UUID }] }).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({ parts: [{ partId: null, marksAwarded: 1 }] }).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({ parts: [{ marksAwarded: 1 }] }).success).toBe(true);
    // a bare null ELEMENT still rejects — the depth-2 invalid_type the route's
    // 057/058 NPE-parity guard serves (the dedup loop NPEs → 500)
    expect(selfMarkRequestSchema.safeParse({ parts: [null] }).success).toBe(false);
  });

  test("rejects duplicate partIds with the controller's exact 400 message", () => {
    const dup = selfMarkRequestSchema.safeParse({
      parts: [
        { partId: UUID, marksAwarded: 1 },
        { partId: UUID, marksAwarded: 2 },
      ],
    });
    expect(dup.success).toBe(false);
    if (!dup.success) {
      expect(dup.error.issues[0]?.message).toBe(`duplicate part in self-mark: ${UUID}`);
    }
  });

  test("T-MIG-059 (F-B): the dedup law is HashMap.put semantics — a throw only on displacing a NON-NULL previous value (LearnerSelfMarkController :42-48)", () => {
    // put(X, null) then put(X, 1): the displaced value is null — NO throw
    expect(
      selfMarkRequestSchema.safeParse({
        parts: [{ partId: UUID, marksAwarded: null }, { partId: UUID, marksAwarded: 1 }],
      }).success,
    ).toBe(true);
    // put(X, 1) then put(X, null): displaces the non-null 1 — THROWS
    const displaced = selfMarkRequestSchema.safeParse({
      parts: [{ partId: UUID, marksAwarded: 1 }, { partId: UUID, marksAwarded: null }],
    });
    expect(displaced.success).toBe(false);
    if (!displaced.success) {
      expect(displaced.error.issues[0]?.message).toBe(`duplicate part in self-mark: ${UUID}`);
    }
    // null keys are legal (HashMap.put(null, v) :44) and string-concat
    // renders them "null" exactly like Java
    const nullKey = selfMarkRequestSchema.safeParse({
      parts: [{ partId: null, marksAwarded: 1 }, { partId: null, marksAwarded: 2 }],
    });
    expect(nullKey.success).toBe(false);
    if (!nullKey.success) {
      expect(nullKey.error.issues[0]?.message).toBe("duplicate part in self-mark: null");
    }
  });

  test("null/absent parts: schema ACCEPTS (no declared constraint) — core then NPEs → 500 (captured flag, R0 call)", () => {
    expect(selfMarkRequestSchema.safeParse({ parts: null }).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({}).success).toBe(true);
  });

  test("comment is unconstrained and nullish (no annotations on the record)", () => {
    expect(selfMarkRequestSchema.safeParse({ ...OK_SELF_MARK, comment: null }).success).toBe(true);
    expect(selfMarkRequestSchema.safeParse({ ...OK_SELF_MARK, comment: "misread the stem" }).success).toBe(true);
  });
});

describe("partSelfMarkSchema", () => {
  test("rejects non-UUID partId", () => {
    expect(partSelfMarkSchema.safeParse({ partId: "nope", marksAwarded: 1 }).success).toBe(false);
  });
});

// ── response views: present-or-null, never absent ───────────────────────────

describe("AttemptResultView — null-vs-empty construction facts", () => {
  const OK_RESULT = {
    attemptId: UUID,
    questionId: UUID2,
    correct: true,
    marksAwarded: 3,
    marksTotal: 3,
    correctOptionLabel: "B",
    implicatedMisconceptionIds: [UUID],
    submittedAt: "2026-10-05T19:02:00.123456Z",
  };

  test("accepts a full view and a null correctOptionLabel (.orElse(null))", () => {
    expect(attemptResultViewSchema.safeParse(OK_RESULT).success).toBe(true);
    expect(attemptResultViewSchema.safeParse({ ...OK_RESULT, correctOptionLabel: null }).success).toBe(true);
  });

  test("implicatedMisconceptionIds is never null (List.of() default)", () => {
    expect(attemptResultViewSchema.safeParse({ ...OK_RESULT, implicatedMisconceptionIds: [] }).success).toBe(true);
    expect(attemptResultViewSchema.safeParse({ ...OK_RESULT, implicatedMisconceptionIds: null }).success).toBe(false);
  });

  test("rejects an unknown questionType domain leakage via markingState enums", () => {
    expect(attemptMarkingStateSchema.safeParse("AUTO_GRADED").success).toBe(true);
    expect(attemptMarkingStateSchema.safeParse("auto_graded").success).toBe(false);
    expect(answerMarkingStateSchema.safeParse("AUTO_GRADED").success).toBe(false); // attempt-level only
    expect(answerMarkingStateSchema.safeParse("SELF_MARKED").success).toBe(true);
  });
});

describe("StructuredAttemptResultView — pending marking", () => {
  const OK_STRUCTURED_RESULT = {
    attemptId: UUID,
    questionId: UUID2,
    marksPossible: 6,
    markingState: "PENDING",
    submittedAt: "2026-10-05T19:02:00Z",
    parts: [{ partId: UUID, label: "a", marksPossible: 3, markingState: "PENDING", marksAwarded: null }],
  };

  test("accepts pending parts with null marksAwarded", () => {
    expect(structuredAttemptResultViewSchema.safeParse(OK_STRUCTURED_RESULT).success).toBe(true);
  });

  test("accepts marked parts (SELF_MARKED) and rejects an unknown marking state", () => {
    expect(
      structuredAttemptResultViewSchema.safeParse({
        ...OK_STRUCTURED_RESULT,
        markingState: "SELF_MARKED",
        parts: [{ partId: UUID, label: "a", marksPossible: 3, markingState: "SELF_MARKED", marksAwarded: 2 }],
      }).success,
    ).toBe(true);
    expect(
      structuredAttemptResultViewSchema.safeParse({ ...OK_STRUCTURED_RESULT, markingState: "MARKED" }).success,
    ).toBe(false);
  });
});

describe("AttemptHistoryView — honesty nullability", () => {
  const OK_ITEM = {
    attemptId: UUID,
    questionId: UUID2,
    questionType: "MCQ_SINGLE",
    externalRef: "4CH1-q1",
    commandWord: "explain",
    stemExcerpt: "Which substance…",
    marksTotal: 3,
    topicNodeId: UUID,
    topicCode: "4CH1-S1-a",
    topicTitle: "States of matter",
    correct: true,
    marksAwarded: 3,
    markingState: "AUTO_GRADED",
    evidenceEmitted: true,
    chosenOptionLabel: "C",
    correctOptionLabel: "B",
    implicatedMisconceptionIds: [],
    selfDoubtFlag: false,
    timedCondition: true,
    confidenceLevel: 3,
    responseTimeMs: 42000,
    attemptedAt: "2026-10-05T19:02:00Z",
    parts: [],
  };

  test("accepts a settled MCQ item", () => {
    expect(attemptHistoryViewSchema.safeParse({ learnerId: UUID, total: 1, returned: 1, attempts: [OK_ITEM] }).success).toBe(true);
  });

  test("accepts the pending-structured shape: correct/marksAwarded null, MCQ labels null, confidenceLevel null", () => {
    const pending = {
      ...OK_ITEM,
      questionType: "STRUCTURED",
      correct: null,
      marksAwarded: null,
      chosenOptionLabel: null,
      correctOptionLabel: null,
      confidenceLevel: null,
      markingState: "PENDING",
      parts: [{ partId: UUID, label: "a", marksPossible: 3, marksAwarded: null, markingState: "PENDING" }],
    };
    expect(attemptHistoryViewSchema.safeParse({ learnerId: UUID, total: 1, returned: 1, attempts: [pending] }).success).toBe(true);
  });

  test("accepts missing topic node (topicCode/topicTitle null, topicNodeId null) — graph.node miss branch", () => {
    const noTopic = { ...OK_ITEM, topicNodeId: null, topicCode: null, topicTitle: null };
    expect(attemptHistoryViewSchema.safeParse({ learnerId: UUID, total: 0, returned: 0, attempts: [noTopic] }).success).toBe(true);
  });

  test("rejects unknown questionType values", () => {
    expect(
      attemptHistoryViewSchema.safeParse({
        learnerId: UUID,
        total: 0,
        returned: 0,
        attempts: [{ ...OK_ITEM, questionType: "MCQ" }],
      }).success,
    ).toBe(false);
  });
});

describe("MarkSchemeRevealView — learner-narrow panel", () => {
  const OK_REVEAL = {
    questionId: UUID,
    questionExternalRef: "sme-eq-1-q2",
    schemeId: UUID2,
    validationState: "VALIDATED",
    schemeMarks: 4,
    questionMarks: 4,
    parts: [{ partId: UUID, label: "a", prompt: null, marks: 4, points: [{ ref: "a(i)", text: "…", marks: 2 }] }],
    generalPoints: [],
  };

  test("accepts a reveal with null prompt (QuestionPart.prompt nullable)", () => {
    expect(markSchemeRevealViewSchema.safeParse(OK_REVEAL).success).toBe(true);
  });

  test("rejects an unknown validationState (enum domain shared with content lane)", () => {
    expect(markSchemeRevealViewSchema.safeParse({ ...OK_REVEAL, validationState: "PENDING" }).success).toBe(false);
  });
});

describe("StudentQuestionView / QuestionFamilyView — stripped projection", () => {
  const OK_STUDENT = {
    id: UUID,
    externalRef: "sme-eq-1-q2-p1",
    type: "MCQ_SINGLE",
    stem: "…",
    marks: 1,
    difficulty: 2,
    expectedTimeSeconds: 90,
    commandWord: null,
    primaryTopicNodeId: UUID2,
    examPaperId: null,
    options: [{ id: UUID, label: "A", text: "…" }],
    parts: [],
    specPointCodes: ["4CH1-1.15"],
    specPoints: [{ code: "4CH1-1.15", role: "PRIMARY", applicability: null }],
  };

  test("accepts a learner question with null applicability and empty parts/options arrays", () => {
    expect(studentQuestionViewSchema.safeParse(OK_STUDENT).success).toBe(true);
  });

  test("unknown keys are STRIPPED, not rejected (zod non-strict = Jackson binding fact); the no-leak guarantee lives in the construction sites + golden capture, not schema strictness", () => {
    const parsed = studentQuestionViewSchema.parse({
      ...OK_STUDENT,
      options: [{ id: UUID, label: "A", text: "…", correct: true, misconceptionNodeId: UUID2 }],
    });
    expect(Object.keys(parsed.options[0] ?? {}).sort()).toEqual(["id", "label", "text"]);
  });

  test("family type is the two-value domain, not Question.Type", () => {
    const family = {
      key: "sme-eq-1-q2",
      ref: "sme-eq-1-q2",
      marks: 6,
      difficulty: 2,
      type: "STRUCTURED",
      multi: true,
      parts: [OK_STUDENT],
    };
    expect(questionFamilyViewSchema.safeParse(family).success).toBe(true);
    expect(questionFamilyViewSchema.safeParse({ ...family, type: "SHORT_ANSWER" }).success).toBe(false);
  });
});

describe("TeacherQuestionView — includes the stripped facts", () => {
  test("accepts options with correct + misconception tags and unknown provenance rejected", () => {
    const view = {
      id: UUID,
      externalRef: "4CH1-q1",
      type: "MCQ_SINGLE",
      stem: "…",
      marks: 1,
      difficulty: 1,
      expectedTimeSeconds: 60,
      commandWord: null,
      primaryTopicNodeId: null,
      active: true,
      provenance: "SEED_DEMO",
      options: [{ id: UUID, label: "A", text: "…", correct: true, misconceptionNodeId: null }],
    };
    expect(teacherQuestionViewSchema.safeParse(view).success).toBe(true);
    expect(questionProvenanceSchema.safeParse("AI_SUGGESTED").success).toBe(false);
  });
});

describe("ExamPaper views — detail payload", () => {
  const OK_DETAIL = {
    paper: {
      id: UUID,
      subjectId: UUID2,
      title: "WPH11 January 2022",
      board: "Edexcel",
      qualification: "IAL",
      unit: "WPH11",
      sessionLabel: "January 2022",
      paperCode: "WPH11/01",
      validationState: "SUGGESTED",
      provenance: "PAST_PAPER",
      questionPaperDocumentId: null,
      markSchemeDocumentId: null,
    },
    questions: [
      {
        questionId: UUID2,
        externalRef: "WPH11-2022-01-03a",
        marks: 2,
        provenance: "PAST_PAPER",
        versionValidationState: null,
        partCount: 0,
        currentVersionId: null,
        specPoints: [],
      },
    ],
  };

  test("accepts a paper with no versions yet (null version fields, partCount 0, honest-empty specPoints)", () => {
    expect(examPaperDetailResponseSchema.safeParse(OK_DETAIL).success).toBe(true);
  });

  test("rejects null specPoints (getOrDefault(id, List.of()) — never null)", () => {
    expect(
      examPaperDetailResponseSchema.safeParse({
        ...OK_DETAIL,
        questions: [{ ...OK_DETAIL.questions[0], specPoints: null }],
      }).success,
    ).toBe(false);
  });
});

describe("SelfMarkView — the self-mark receipt", () => {
  test("accepts the 201 view with answer-level marking states", () => {
    expect(
      selfMarkViewSchema.safeParse({
        attemptId: UUID,
        marksAwarded: 4,
        marksTotal: 6,
        evidenceFired: true,
        parts: [{ partId: UUID, label: "a", marksAwarded: 2, marksPossible: 3, markingState: "SELF_MARKED" }],
      }).success,
    ).toBe(true);
  });
});

describe("QuestionTopicTaxonomyView — census shape", () => {
  test("accepts the sidebar shape and rejects negative counts? (no — ints only, signs unconstrained)", () => {
    const taxonomy = {
      sections: [
        {
          nodeId: UUID,
          code: "4CH1-S1",
          title: "Principles of chemistry",
          distinctQuestionCount: 2,
          distinctFamilyCount: 1,
          topics: [
            {
              nodeId: UUID2,
              code: "4CH1-S1-a",
              title: "States of matter",
              questionCount: 2,
              mcqCount: 2,
              structuredCount: 0,
              familyCount: 1,
            },
          ],
        },
      ],
      totalDistinctQuestions: 2,
      totalDistinctFamilies: 1,
    };
    expect(questionTopicTaxonomyViewSchema.safeParse(taxonomy).success).toBe(true);
    expect(questionTopicTaxonomyViewSchema.safeParse({ ...taxonomy, sections: null }).success).toBe(false);
  });
});

// ── parameter binding ────────────────────────────────────────────────────────

describe("Query/path parameters — Spring binding semantics", () => {
  test("questions list params: optional UUIDs, unparseable rejected (Spring → 400)", () => {
    expect(questionsListParamsSchema.safeParse({}).success).toBe(true);
    expect(questionsListParamsSchema.safeParse({ topicNodeId: UUID }).success).toBe(true);
    expect(questionsListParamsSchema.safeParse({ rootId: "not-a-uuid" }).success).toBe(false);
  });

  test("attempt history limit: advisory — binds -5 and 1000 (service clamps), rejects 'abc' and overflow", () => {
    expect(attemptHistoryParamsSchema.safeParse({}).success).toBe(true);
    expect(attemptHistoryParamsSchema.safeParse({ limit: "-5" }).success).toBe(true);
    expect(attemptHistoryParamsSchema.safeParse({ limit: "1000" }).success).toBe(true);
    expect(attemptHistoryParamsSchema.safeParse({ limit: "abc" }).success).toBe(false);
    expect(attemptHistoryParamsSchema.safeParse({ limit: "2147483648" }).success).toBe(false);
    expect(attemptHistoryParamsSchema.safeParse({ limit: " 10 " }).success).toBe(true); // Spring trims
  });

  test("exam papers list: optional subjectId UUID", () => {
    expect(examPapersListParamsSchema.safeParse({}).success).toBe(true);
    expect(examPapersListParamsSchema.safeParse({ subjectId: UUID }).success).toBe(true);
    expect(examPapersListParamsSchema.safeParse({ subjectId: "x" }).success).toBe(false);
  });

  test("path UUID bundles reject unparseable ids (distinct from the 404 unknown-id path)", () => {
    expect(questionIdPathSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(examPaperIdPathSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(selfMarkPathSchema.safeParse({ attemptId: UUID }).success).toBe(true);
  });
});
