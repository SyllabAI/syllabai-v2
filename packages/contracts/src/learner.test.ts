/**
 * Learner-surface contract pins (T-MIG-038) — acceptance baseline is the
 * Java declaration (frozen syllabai-core @ 6cad6ef). Positive pins from
 * Java-declared shapes, negative pins for Java-rejected inputs, wire-
 * vocabulary and honesty-law pins.
 */
import { describe, expect, it } from "bun:test";
import {
  TRAIL_DEFAULT_LIMIT,
  TRAIL_MAX_LIMIT,
  NBA_POLICY,
  SMART_LESSON_POLICY,
  agendaViewSchema,
  assignmentViewSchema,
  cardScheduleViewSchema,
  courseExamTargetViewSchema,
  courseStatsViewSchema,
  flashcardRatingRequestSchema,
  flashcardRatingTrailViewSchema,
  flashcardRatingViewSchema,
  flashcardReviewScheduleViewSchema,
  knowledgeGraphParamsSchema,
  learnerAssignmentViewSchema,
  learnerKnowledgeGraphViewSchema,
  learnerStateViewSchema,
  masteryBandSchema,
  nextBestActionsViewSchema,
  nodeWithStateViewSchema,
  noteVoteRequestSchema,
  noteVoteViewSchema,
  reviewViewSchema,
  skillStateViewSchema,
  smartLessonViewSchema,
  topicStatusViewSchema,
} from "./learner";

const UUID = "0b8fd85b-6c47-4d6e-9e38-2c69b47c1d01";
const UUID2 = "1c9ae86b-7c47-4d6e-9e38-2c69b47c1d02";
const T = "2026-10-04T09:37:00.129532Z";

describe("request bodies", () => {
  it("flashcardRatingRequestSchema: @NotBlank @Size(3,64) @Pattern card id", () => {
    expect(
      flashcardRatingRequestSchema.safeParse({
        cardId: "4ch1-bio-card-12",
        rating: "know",
        subtopicCode: "4CH1-S1-a",
      }).success,
    ).toBe(true);
    expect(
      flashcardRatingRequestSchema.safeParse({ cardId: "ab", rating: "know", subtopicCode: "c1" })
        .success,
    ).toBe(false); // < min 3
    expect(
      flashcardRatingRequestSchema.safeParse({
        cardId: "bad card!", // space and ! break the pattern
        rating: "know",
        subtopicCode: "4CH1-S1-a",
      }).success,
    ).toBe(false);
    expect(
      flashcardRatingRequestSchema.safeParse({ cardId: "card-1", rating: "", subtopicCode: "c1" })
        .success,
    ).toBe(false); // @NotBlank
    expect(
      flashcardRatingRequestSchema.safeParse({ cardId: "card-1", rating: "know", subtopicCode: "x" })
        .success,
    ).toBe(false); // subtopicCode < min 2
  });

  it("noteVoteRequestSchema mirrors the same law for noteId/vote", () => {
    expect(
      noteVoteRequestSchema.safeParse({
        noteId: "4ch1-bio-note-3",
        vote: "helpful",
        subtopicCode: "4CH1-S1-a",
      }).success,
    ).toBe(true);
    expect(
      noteVoteRequestSchema.safeParse({ noteId: "ok-id", vote: "up", subtopicCode: "c1" }).success,
    ).toBe(true); // "up" is a legal POST form (tolerant parse at the controller)
  });
});

describe("wire vocabularies", () => {
  it("ratings serve still-learning|know; votes helpful|not-helpful", () => {
    expect(flashcardRatingViewSchema.safeParse({ cardId: "c", rating: "still-learning", subtopicCode: null, nodeId: UUID, occurredAt: T }).success).toBe(true);
    expect(flashcardRatingViewSchema.safeParse({ cardId: "c", rating: "STILL_LEARNING", subtopicCode: null, nodeId: UUID, occurredAt: T }).success).toBe(false); // enum name is NOT the wire form
    expect(noteVoteViewSchema.safeParse({ noteId: "n", vote: "not-helpful", subtopicCode: null, nodeId: UUID, occurredAt: T }).success).toBe(true);
    expect(noteVoteViewSchema.safeParse({ noteId: "n", vote: "down", subtopicCode: null, nodeId: UUID, occurredAt: T }).success).toBe(false); // tolerant forms are POST-side only
  });

  it("assignment status is the wire pair open|closed", () => {
    expect(assignmentViewSchema.safeParse({
      id: UUID, title: "t", courseSlug: "c", courseLabel: "C", specRefs: [],
      marksTotal: 10, questionCount: 5, dueAt: T, status: "open",
      classId: null, createdAt: T,
    }).success).toBe(true);
    expect(assignmentViewSchema.safeParse({
      id: UUID, title: "t", courseSlug: "c", courseLabel: "C", specRefs: [],
      marksTotal: 10, questionCount: 5, dueAt: T, status: "OPEN",
      classId: null, createdAt: T,
    }).success).toBe(false);
  });

  it("mastery band is the closed derived domain", () => {
    expect(masteryBandSchema.safeParse("LOW").success).toBe(true);
    expect(masteryBandSchema.safeParse("DEVELOPING").success).toBe(true);
    expect(masteryBandSchema.safeParse("SECURE").success).toBe(true);
    expect(masteryBandSchema.safeParse("WEAK").success).toBe(false);
  });
});

describe("trail constants and view (T-C61/T-C57 true-merge law)", () => {
  it("limit default 200, cap 500 (clamped, not rejected)", () => {
    expect(TRAIL_DEFAULT_LIMIT).toBe(200);
    expect(TRAIL_MAX_LIMIT).toBe(500);
  });

  it("trail page: events newest-first, nextCursor null at end, hasMore pairs with it", () => {
    expect(
      flashcardRatingTrailViewSchema.safeParse({
        events: [{ cardId: "c", rating: "know", subtopicCode: "4CH1-S1-a", nodeId: UUID, occurredAt: T }],
        nextCursor: "eyJ0IjoiMjAyNi0xMC0wNFQwOTozNzowMFoiLCJpIjoiMGI4ZmQ4NWItNmM0Ny00ZDZlLTllMzgtMmM2OWI0N2MxZDAxIn0",
        hasMore: true,
        generatedAt: T,
      }).success,
    ).toBe(true);
    expect(
      flashcardRatingTrailViewSchema.safeParse({ events: [], nextCursor: null, hasMore: false, generatedAt: T })
        .success,
    ).toBe(true);
  });
});

describe("skill/misconception state views (ADR-031/032 honesty law)", () => {
  it("SkillStateView carries anchor + re-decayed value + derived band", () => {
    expect(
      skillStateViewSchema.safeParse({
        nodeId: UUID,
        mastery: 0.62,
        effectiveMastery: 0.51,
        band: "DEVELOPING",
        attempts: 9,
        correctCount: 6,
        lastPracticedAt: T,
        proceduralFluencyGap: null, // F-162: null until both conditions answered
        nodeName: null, // absent node row — clients keep id fallback
      }).success,
    ).toBe(true);
    expect(skillStateViewSchema.safeParse({
      nodeId: UUID, mastery: 0.5, effectiveMastery: 0.4, band: "UNMEASURED",
      attempts: 1, correctCount: 1, lastPracticedAt: T, proceduralFluencyGap: null, nodeName: null,
    }).success).toBe(false);
  });

  it("MisconceptionStateView probability is the relaxed value", () => {
    expect(
      learnerStateViewSchema.safeParse({
        learnerId: UUID,
        skillStates: [],
        misconceptionStates: [{
          misconceptionNodeId: UUID2,
          probability: 0.44,
          active: true,
          evidenceCount: 3,
          lastEvidenceAt: T,
          misconceptionName: "current split",
        }],
        pendingReviews: [{ nodeId: UUID, dueAt: T, reason: "DECAY_CROSSED_THRESHOLD", nodeName: null }],
        tutorEngagements: [],
        flashcardRatings: [],
        noteVotes: [],
        examTargets: [],
      }).success,
    ).toBe(true);
  });

  it("review reason is the Reason enum names, not wire forms", () => {
    expect(reviewViewSchema.safeParse({ nodeId: UUID, dueAt: T, reason: "TEACHER_ASSIGNED", nodeName: null }).success).toBe(true);
    expect(reviewViewSchema.safeParse({ nodeId: UUID, dueAt: T, reason: "decay", nodeName: null }).success).toBe(false);
  });
});

describe("exam target + agenda + course stats", () => {
  const examTarget = {
    courseSlug: "4ch1",
    seriesId: UUID,
    seriesCode: "4CH1-S1",
    label: "Summer 2026",
    windowStart: "2026-05-12",
    windowEnd: "2026-05-20",
    entryDeadline: "2026-03-01",
    resultsDate: "2026-07-01",
    estimated: true, // MUST render with ≈
    daysToWindowStart: 219,
    daysToWindowEnd: 227,
    entryDeadlinePassed: false,
  };

  it("CourseExamTargetView pins calendar dates as strings and the derived countdown", () => {
    expect(courseExamTargetViewSchema.safeParse(examTarget).success).toBe(true);
    expect(courseExamTargetViewSchema.safeParse({ ...examTarget, daysToWindowStart: 1.5 }).success).toBe(false);
  });

  it("CourseExamTargetView: entryDeadline/resultsDate nullable (V62 'not always announced') — null parses, window dates do not", () => {
    // The frozen record declares plain LocalDate (CourseExamTargetView.java
    // :27-28) and V62 leaves entry_deadline/results_date nullable while
    // window_start/window_end are NOT NULL — a series with neither date
    // announced must parse (F2 register item, two-lane corroboration).
    const nullDates = {
      ...examTarget,
      entryDeadline: null,
      resultsDate: null,
      // entryDeadlinePassed already encodes the null law in the port:
      // entryDeadline != null && entryDeadline.isBefore(today) → false.
      entryDeadlinePassed: false,
    };
    expect(courseExamTargetViewSchema.safeParse(nullDates).success).toBe(true);
    // Half-announced state is legal too (each column independently nullable).
    expect(
      courseExamTargetViewSchema.safeParse({ ...examTarget, resultsDate: null }).success,
    ).toBe(true);
    // The NOT NULL columns stay strict.
    expect(courseExamTargetViewSchema.safeParse({ ...examTarget, windowStart: null }).success).toBe(false);
    expect(courseExamTargetViewSchema.safeParse({ ...examTarget, windowEnd: null }).success).toBe(false);
    // And the full non-null posture (examTarget) still parses — widening only.
  });

  it("AgendaView: actions nullable (no rootId supplied), examTargets an honest empty list", () => {
    expect(
      agendaViewSchema.safeParse({
        learnerId: UUID,
        asOf: T,
        dueReviews: [],
        assignments: [],
        actions: null,
        examTargets: [examTarget],
      }).success,
    ).toBe(true);
    expect(
      agendaViewSchema.safeParse({
        learnerId: UUID,
        asOf: T,
        dueReviews: [],
        assignments: [{
          assignment: {
            id: UUID2, title: "HW", courseSlug: "4ch1", courseLabel: "Chem", specRefs: ["4CH1/1/1"],
            marksTotal: 20, questionCount: 8, dueAt: T, status: "open", classId: null, createdAt: T,
          },
          mySubmission: null, // null until they submit
        }],
        actions: {
          learnerId: UUID, rootId: UUID2, asOf: T, policy: NBA_POLICY, actions: [],
        },
        examTargets: [],
      }).success,
    ).toBe(true);
  });

  it("CourseStatsView: distinct-coverage ints", () => {
    expect(
      courseStatsViewSchema.safeParse({
        learnerId: UUID, attempts: 41, distinctQuestions: 30, notesViewed: 7, flashcardsRated: 12,
      }).success,
    ).toBe(true);
  });
});

describe("knowledge graph (F-034 — retire the client-side join)", () => {
  const practisedNode = {
    id: UUID,
    code: "4CH1-S1-a",
    type: "SUBTOPIC",
    title: "Atomic structure",
    description: null, // column without nullable=false
    childIds: [],
    mastery: 0.7,
    effectiveMastery: 0.61,
    band: "DEVELOPING",
    attempts: 5,
    correctCount: 4,
    lastPracticedAt: T,
    proceduralFluencyGap: null,
    reviewDueAt: null,
    reviewReason: null,
    misconceptionProbability: null,
    misconceptionActive: null,
    applicability: null, // only on spec-point nodes
  };

  it("unpractised nodes carry NULL proficiency (never zeros, never fabricated bands)", () => {
    const unpractised = {
      ...practisedNode,
      id: UUID2,
      mastery: null,
      effectiveMastery: null,
      band: null,
      attempts: null,
      correctCount: null,
      lastPracticedAt: null,
    };
    expect(nodeWithStateViewSchema.safeParse(unpractised).success).toBe(true);
    // NOTE: a port emitting mastery 0 for an unpractised node is a GOLDEN
    // divergence, not a schema violation — the honesty law lives in the
    // frozen service (null is what it writes); the schema mirrors the shape.
  });

  it("type is the full six-value NodeType domain (CONCEPT included)", () => {
    expect(nodeWithStateViewSchema.safeParse({ ...practisedNode, type: "CONCEPT" }).success).toBe(true);
    expect(nodeWithStateViewSchema.safeParse({ ...practisedNode, type: "SPEC" }).success).toBe(false);
  });

  it("full view: nodes + prerequisiteEdges", () => {
    expect(
      learnerKnowledgeGraphViewSchema.safeParse({
        learnerId: UUID,
        rootId: UUID2,
        rootCode: "4CH1",
        rootTitle: "Chemistry",
        asOf: T,
        nodes: [practisedNode],
        prerequisiteEdges: [{ prerequisiteId: UUID2, prerequisiteCode: "4CH1-S1", nodeId: UUID, nodeCode: "4CH1-S1-a" }],
      }).success,
    ).toBe(true);
  });

  it("params: rootId required uuid", () => {
    expect(knowledgeGraphParamsSchema.safeParse({ rootId: UUID }).success).toBe(true);
    expect(knowledgeGraphParamsSchema.safeParse({}).success).toBe(false);
  });
});

describe("flashcard review schedule (T-C53 — timing only, persisted nowhere)", () => {
  it("cards carry due/scheduled timing + summary with nullable nextDueAt", () => {
    expect(
      flashcardReviewScheduleViewSchema.safeParse({
        learnerId: UUID,
        generatedAt: T,
        summary: { due: 2, scheduled: 9, nextDueAt: T },
        cards: [{
          cardId: "4ch1-bio-card-12",
          subtopicCode: null, // honest null on absent anchor rows
          nodeId: UUID,
          rating: "still-learning",
          streak: 1,
          lastRatedAt: T,
          dueAt: T,
          due: true,
          intervalDays: 3,
        }],
      }).success,
    ).toBe(true);
    expect(cardScheduleViewSchema.safeParse({
      cardId: "c", subtopicCode: null, nodeId: UUID, rating: "know",
      streak: 0, lastRatedAt: T, dueAt: T, due: false, intervalDays: 1,
    }).success).toBe(true);
  });
});

describe("smart lesson (sprint-2 §8 v2 ladder)", () => {
  it("policy is the smart-lesson/v2 literal; action ladder + honest status", () => {
    expect(
      smartLessonViewSchema.safeParse({
        learnerId: UUID,
        rootId: UUID2,
        topicNodeId: UUID,
        topicCode: "4CH1-S1",
        topicTitle: "Atomic structure",
        asOf: T,
        policy: SMART_LESSON_POLICY,
        action: {
          actionType: "PRACTISE_QUESTIONS",
          reasonCode: "LOW_MASTERY",
          targetNodeId: UUID,
          targetCode: "4CH1-S1",
          targetTitle: "Atomic structure",
          questionId: UUID2,
          servableQuestionCount: 6,
          reasonDetail: "Mastery 0.31 below the 0.45 practice line.",
        },
        topicStatus: {
          coverage: "PARTIAL",
          attempts: 4,
          mastery: 0.31,
          effectiveMastery: 0.27,
          reviewDue: false,
          strongestMisconceptionProbability: null,
          fluencyGap: null,
          tutorAsks: 0,
          servableQuestions: 6,
        },
        prerequisites: [{ nodeId: UUID2, code: "4CH1-S0", title: "Prior", effectiveMastery: null, attempts: null, measuredWeak: false }],
        misconceptions: [{ nodeId: UUID2, code: "M-1", title: "split", probability: 0.4, active: false, remediationNodeCode: null }],
        evidence: [{ key: "attempts", value: "4" }],
      }).success,
    ).toBe(true);
    expect(smartLessonViewSchema.safeParse({
      learnerId: UUID, rootId: UUID2, topicNodeId: UUID, topicCode: "c", topicTitle: "t",
      asOf: T, policy: "smart-lesson/v1", action: {}, topicStatus: {}, prerequisites: [],
      misconceptions: [], evidence: [],
    }).success).toBe(false);
  });

  it("topicStatus coverage is the three-value honest diagnosis domain", () => {
    expect(topicStatusViewSchema.safeParse({
      coverage: "UNMEASURED", attempts: 0, mastery: null, effectiveMastery: null,
      reviewDue: false, strongestMisconceptionProbability: null, fluencyGap: null,
      tutorAsks: 0, servableQuestions: 3,
    }).success).toBe(true);
    expect(topicStatusViewSchema.safeParse({
      coverage: "STRONG", attempts: 0, mastery: null, effectiveMastery: null,
      reviewDue: false, strongestMisconceptionProbability: null, fluencyGap: null,
      tutorAsks: 0, servableQuestions: 3,
    }).success).toBe(false);
  });
});

describe("NBA policy literal (NextBestActionService :79)", () => {
  it("policy literal matches the frozen constant", () => {
    const view = {
      learnerId: UUID, rootId: UUID2, asOf: T, policy: "nba-rules/v1.3",
      actions: [{ rank: 1, actionType: "REVIEW_TOPIC", reasonCode: "DUE_REVIEW",
        targetNodeId: UUID, targetCode: "4CH1-S1", targetTitle: "t",
        questionId: null, servableQuestionCount: 4, reasonDetail: "due" }],
    };
    expect(nextBestActionsViewSchema.safeParse(view).success).toBe(true);
    expect(nextBestActionsViewSchema.safeParse({ ...view, policy: "nba/v1" }).success).toBe(false);
  });
});
