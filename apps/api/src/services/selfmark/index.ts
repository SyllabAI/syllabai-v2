/**
 * Learner self-marking service — verbatim port of the frozen
 * LearnerSelfMarkService.java (ADR-026 SME practice tranche; T-MIG-032
 * tranche 1, verified 2026-10-05):
 *   - attempt-row lock (select ... for update) BEFORE any state load (the
 *     evidence-state concurrency fix pattern, TeacherMarkingService precedent)
 *   - no existence leak: another learner's attempt -> NotFound("attempt")
 *   - structured-only; pre-settlement only (PENDING | SMART_MARKED answers);
 *     the request's part set must EQUAL the attempt's part set
 *   - bounds: 0..max(part.marks, 0) violation -> Conflict 409
 *   - settles into learner_self_marks (NEVER human_marks -- the kappa
 *     agreement sample stays teacher-only), answers -> SELF_MARKED, attempt ->
 *     SELF_MARKED + recordTotalMarks(sum, question.marks) with the
 *     conservative full-marks-equals-correct rule (Attempt.java:150-155)
 *   - evidence ONCE at completion via the E-1 claim contract bound at
 *     T-MIG-030 tranche-2: publishGraded resolves a claim (true = fired);
 *     the service then issues the once-only guarded flip
 *     (update ... where evidence_emitted = false -- Attempt.java:159-161
 *     markEvidenceEmitted parity); claim false (already fired) -> no flip
 *
 * Bind-slot discipline (fleet convention): every ${} slot is a bind
 * parameter; column lists and state-bearing predicates inline as static
 * template text.
 */
import type { SqlFn } from "../assessment/sql";

export class NotFoundError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} ${id} not found`);
  }
}
export class BadRequestError extends Error {}
export class ConflictError extends Error {}

/**
 * The graded-evidence seam — publishGraded parity (EvidencePublisher.java:51-63).
 * T-MIG-137: the payload carries the FULL frozen observable shape (the fields
 * the learner-model listener (model-update.ts AssessmentEvidenceEvent) and the
 * struggle engine (StruggleEvidenceEvent) consume):
 *   - primaryTopicNodeId / secondaryTopicNodeIds / specPointNodeIds
 *     (EvidencePublisher.java :100-120)
 *   - questionType + optionCount (:86-87 — the LIVE MCQ_SINGLE count, else 0)
 *   - expressed/observed misconception ids — the graded path's are honestly
 *     EMPTY (:61 List.of(): a structured answer expresses no distractor, and
 *     the untagged-wrong law means no misconception may be invented)
 *   - selfDoubtFlag (the attempt row's column — the 5a METACOGNITIVE input,
 *     AssessmentEvidenceRecordedEvent.selfDoubtFlag / StruggleInferenceService :62)
 * marksAwarded/marksTotal/correct ride along as the frozen event's score
 * fields (:56-60); the assembler derives them from the question row so the
 * three lanes cannot drift.
 * The claim is the return: true = this call emitted; false = suppressed
 * (already fired — the frozen markEvidenceEmitted guard :53-55).
 */
export interface GradedEvidenceEvent {
  attemptId: string;
  learnerId: string;
  questionId: string;
  marksAwarded: number;
  marksTotal: number;
  correct: boolean;
  primaryTopicNodeId: string | null;
  secondaryTopicNodeIds: string[];
  specPointNodeIds: string[];
  questionType: string | null;
  optionCount: number;
  expressedMisconceptionIds: string[];
  observedMisconceptionIds: string[];
  selfDoubtFlag: boolean;
  occurredAt: string;
}

export interface GradedEvidencePublisher {
  publishGraded(event: GradedEvidenceEvent): Promise<boolean>;
}

export const noopGradedEvidencePublisher: GradedEvidencePublisher = {
  publishGraded: async () => false,
};

/**
 * The E-2 claim-law double for the route tests (the retired T-MIG-030
 * claiming stub, named): claims true, emits NOTHING. The live default is
 * createGradedEvidencePublisher (routes/assessment) — this double documents
 * the pre-137 posture exactly as frozenParityEvidencePublisher does for the
 * MCQ seam.
 */
export const frozenParityGradedEvidencePublisher: GradedEvidencePublisher = {
  publishGraded: async () => true,
};

/** The lane-supplied base: everything the lanes hold at the fire site. */
export interface GradedEvidenceEventBase {
  attemptId: string;
  learnerId: string;
  questionId: string;
  marksAwarded: number;
  occurredAt: string;
}

/**
 * The graded-lane event assembler (T-MIG-137a) — the frozen publisher's
 * assembly laws in ONE place (EvidencePublisher.java:51-120), so the three
 * marking lanes cannot drift:
 *   - marksTotal = question.marks(); correct = marksTotal > 0 && marksAwarded
 *     >= marksTotal (:56-60, the conservative full-marks-equals-correct rule)
 *   - primary from questions.primary_topic_node_id; secondary from
 *     question_topics with the primary-equal skip (:114-117); spec points
 *     from question_spec_points, deduped, null-skipped (:100-109)
 *   - questionType null-safe (:86); optionCount = the LIVE MCQ_SINGLE option
 *     count, else 0 (:86-87 — non-MCQ formats carry 0)
 *   - expressed/observed misconception ids EMPTY (:61 — the graded path is
 *     the structured path; the MCQ distractor tags never ride publishGraded)
 *   - selfDoubtFlag from the attempts row (the frozen event carries
 *     attempt.selfDoubtFlag(), :79)
 * Fail-loud (the no-silent-skip law): a missing question/attempt row throws.
 */
export async function assembleGradedEvidenceEvent(
  sql: SqlFn,
  base: GradedEvidenceEventBase,
): Promise<GradedEvidenceEvent> {
  const questionRows = (await sql`
    select primary_topic_node_id, question_type, marks
    from questions where id = ${base.questionId}
  `) as unknown as Array<{
    primary_topic_node_id: string | null;
    question_type: string | null;
    marks: number;
  }>;
  if (questionRows.length === 0) throw new NotFoundError("question", base.questionId);
  const question = questionRows[0]!;

  const topicRows = (await sql`
    select node_id from question_topics where question_id = ${base.questionId}
  `) as unknown as Array<{ node_id: string }>;
  const primaryTopicNodeId =
    question.primary_topic_node_id === null ? null : String(question.primary_topic_node_id);
  // topicNodeIds (:111-120): primary first, secondary deduped against it
  const secondaryTopicNodeIds = topicRows
    .map((r) => String(r.node_id))
    .filter((id) => id !== primaryTopicNodeId);

  // specPointNodeIds (:100-109): deduped, null-skipped
  const specPointRows = (await sql`
    select spec_point_node_id from question_spec_points where question_id = ${base.questionId}
  `) as unknown as Array<{ spec_point_node_id: string | null }>;
  const specPointNodeIds = [
    ...new Set(
      specPointRows
        .map((r) => (r.spec_point_node_id === null ? null : String(r.spec_point_node_id)))
        .filter((id): id is string => id !== null),
    ),
  ];

  const doubtRows = (await sql`
    select self_doubt_flag from attempts where id = ${base.attemptId}
  `) as unknown as Array<{ self_doubt_flag: boolean | null }>;
  if (doubtRows.length === 0) throw new NotFoundError("attempt", base.attemptId);
  const selfDoubtFlag = doubtRows[0]!.self_doubt_flag === true;

  // optionCount (:86-87): the LIVE count for MCQ_SINGLE, 0 for every other
  // format — the graded lanes mark structured/short-answer attempts, so the
  // count query is unreachable in practice, but the law is ported, not assumed
  let optionCount = 0;
  if (question.question_type === "MCQ_SINGLE") {
    const optionRows = (await sql`
      select id from question_options where question_id = ${base.questionId}
    `) as unknown as Array<{ id: string }>;
    optionCount = optionRows.length;
  }

  const marksTotal = Number(question.marks);
  return {
    ...base,
    marksTotal,
    correct: marksTotal > 0 && base.marksAwarded >= marksTotal,
    primaryTopicNodeId,
    secondaryTopicNodeIds,
    specPointNodeIds,
    questionType: question.question_type === null ? null : String(question.question_type),
    optionCount,
    expressedMisconceptionIds: [],
    observedMisconceptionIds: [],
    selfDoubtFlag,
  };
}

export interface SubmitClock {
  newId(): string;
  now(): Date;
}

export const defaultClock: SubmitClock = {
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
};

/** Attempt row as the lock statement selects it (plain column names). */
interface AttemptLockRow {
  id: string;
  learner_id: string;
  question_id: string;
  marking_state: string;
  evidence_emitted: boolean;
}

/** answers JOIN question_parts row (the settle-law projection). */
interface AnswerPartRow {
  id: string;
  question_part_id: string;
  marks_awarded: number | null;
  marking_state: string;
  label: string;
  marks: number;
}

export interface SelfMarkPartView {
  partId: string;
  label: string;
  marksAwarded: number;
  /** frozen record component name (PartView.marksPossible) — canonical
   * contracts pin caught the tranche-1 `marks` naming at tranche-2 */
  marksPossible: number;
  markingState: string;
}

/** SelfMarkView.java -- the 201 wire shape. */
export interface SelfMarkView {
  attemptId: string;
  marksAwarded: number;
  marksTotal: number;
  evidenceFired: boolean;
  parts: SelfMarkPartView[];
}

const SETTABLE_STATES = new Set(["PENDING", "SMART_MARKED"]);

export class SelfMarkService {
  constructor(
    private readonly sql: SqlFn,
    private readonly publisher: GradedEvidencePublisher,
    private readonly clock: SubmitClock,
  ) {}

  /**
   * Self-mark every part of the caller's structured attempt in one shot
   * (LearnerSelfMarkService.selfMark :65-134 -- gate ORDER preserved).
   */
  async selfMark(
    learnerId: string,
    attemptId: string,
    marksByPartId: Map<string | null, number | null>,
    comment: string | null,
  ): Promise<SelfMarkView> {
    if (marksByPartId === null || marksByPartId.size === 0) {
      throw new BadRequestError("self-mark carries no part marks");
    }

    // evidence-state concurrency fix pattern: serialize on the attempt row
    // BEFORE loading any attempt state
    const attemptRows = (await this.sql`
      select id, learner_id, question_id, marking_state, evidence_emitted
      from attempts where id = ${attemptId} for update
    `) as unknown as AttemptLockRow[];
    if (attemptRows.length === 0) throw new NotFoundError("attempt", attemptId);
    const attempt = attemptRows[0]!;
    if (attempt.learner_id !== learnerId) {
      // no existence leak across learners
      throw new NotFoundError("attempt", attemptId);
    }

    const questionRows = (await this.sql`
      select id, question_type, marks from questions where id = ${attempt.question_id}
    `) as unknown as Array<{ id: string; question_type: string; marks: number }>;
    const question = questionRows[0]!;
    if (question.question_type !== "STRUCTURED") {
      throw new BadRequestError("self-marking applies to structured attempts only");
    }

    const answers = (await this.sql`
      select ans.id, ans.question_part_id, ans.marks_awarded, ans.marking_state,
             qp.label, qp.marks
      from answers ans join question_parts qp on qp.id = ans.question_part_id
      where ans.attempt_id = ${attemptId}
      order by ans.question_part_id
    `) as unknown as AnswerPartRow[];
    if (answers.length === 0) {
      throw new BadRequestError("attempt carries no part answers");
    }
    for (const a of answers) {
      if (!SETTABLE_STATES.has(a.marking_state)) {
        throw new ConflictError(
          `attempt already settled (${a.marking_state}) -- self-marking is single-shot`,
        );
      }
    }

    // the request must cover exactly the attempt's parts -- no extras,
    // no omissions (SME: one reveal, one full pass). T-MIG-059 (F-B): a
    // null partId key survives the controller loop (HashMap.put(null, v)
    // is legal, LearnerSelfMarkController :44) and dies HERE — a null key
    // is never in byPartId, so the has() check fails and the frozen
    // BadRequestException "self-mark must cover exactly the attempt's
    // parts" (:102-111, after the attempt 404 :79-84) fires.
    // byPartId's key type is widened to string|null so the has() check below
    // accepts the F-B null key directly (has(null) is false — the gate 400s,
    // exactly the frozen HashSet inequality)
    const byPartId = new Map<string | null, AnswerPartRow>(
      answers.map((a) => [a.question_part_id, a]),
    );
    if (marksByPartId.size !== byPartId.size ||
        ![...marksByPartId.keys()].every((k) => byPartId.has(k))) {
      throw new BadRequestError("self-mark must cover exactly the attempt's parts");
    }

    // T-MIG-059 UNBOXING PARITY (frozen LearnerSelfMarkService :113-121):
    // the bound loop reads `int marks = e.getValue()` (:116) — a null
    // Integer NPEs ON UNBOXING the moment its entry is reached, AFTER the
    // exact-parts gate but BEFORE any settle write, and the catch-all
    // advice (:224-230) serves the opaque 500 internal_error. JS null
    // would coerce silently in the comparisons below (null < 0 is false)
    // and settle a 201 — the parity throw instead escapes the handler to
    // the app error boundary, byte-equivalent to the frozen 500. The
    // data-dependent law of record: {partId:"<in-attempt>", marksAwarded:
    // null} -> 500 here; a partId NOT in the attempt -> the exact-parts
    // 400 above fires first.
    // (Residual, disclosed: with BOTH a null value AND an out-of-bound
    // value present, frozen's winner is HashMap hash-iteration order
    // between the NPE and the ConflictException — not emulated,
    // unreachable by capture.)
    for (const marks of marksByPartId.values()) {
      if (marks === null) {
        throw new Error(
          "selfmark unboxing NPE parity: int marks = e.getValue() on a null Integer (LearnerSelfMarkService.java:116)",
        );
      }
    }

    // post-gates narrowing: the gates above guarantee every key is a real
    // part id (a null key 400'd at the exact-parts gate) and every value a
    // number (a null value 500'd at the parity pass) — the frozen core
    // could not have reached here otherwise. The typed view below keeps
    // the bound/settle loops honest.
    const settled = new Map([...marksByPartId] as [string, number][]);

    for (const [partId, marks] of settled) {
      const answer = byPartId.get(partId)!;
      const bound = Math.max(answer.marks, 0);
      if (marks < 0 || (bound > 0 && marks > bound)) {
        throw new ConflictError(`marks ${marks} outside part bound 0\u2013${bound}`);
      }
    }

    // settle: answers first, then the attempt total, then evidence once
    const now = this.clock.now().toISOString();
    for (const [partId, marks] of settled) {
      const answer = byPartId.get(partId)!;
      await this.sql`
        update answers set marks_awarded = ${marks}, marking_state = ${"SELF_MARKED"}
        where id = ${answer.id}
      `;
      await this.sql`
        insert into learner_self_marks (id, answer_id, learner_id, marks_awarded, comment, created_at)
        values (${this.clock.newId()}, ${answer.id}, ${learnerId}, ${marks}, ${comment}, ${now})
      `;
    }
    const totalAwarded = answers
      .map((a) => settled.get(a.question_part_id) ?? a.marks_awarded ?? 0)
      .reduce((s, m) => s + m, 0);
    const correct = question.marks > 0 && totalAwarded >= question.marks;
    await this.sql`
      update attempts set marking_state = ${"SELF_MARKED"}, marks_awarded = ${totalAwarded},
      correct = ${correct}
      where id = ${attemptId}
    `;

    // T-MIG-137a: the event assembly moved to the shared assembler — the
    // frozen publisher's own laws (marksTotal/correct :56-60, topicNodeIds
    // :111-120, specPointNodeIds :100-109, empty misconception lists :61,
    // the attempt's selfDoubtFlag :79) live in ONE place now. The local
    // `correct` computation above remains the ATTEMPT row's settle law
    // (Attempt.java:150-155), a different consumer of the same rule.
    const fired = await this.publisher.publishGraded(
      await assembleGradedEvidenceEvent(this.sql, {
        attemptId,
        learnerId,
        questionId: attempt.question_id,
        marksAwarded: totalAwarded,
        occurredAt: now,
      }),
    );
    if (fired) {
      // E-1: once-only guarded flip (Attempt.java:159-161 parity) -- a second
      // publish is a no-op by the predicate
      await this.sql`
        update attempts set evidence_emitted = true
        where id = ${attemptId} and evidence_emitted = false
      `;
    }

    return {
      attemptId,
      marksAwarded: totalAwarded,
      marksTotal: question.marks,
      evidenceFired: fired,
      parts: answers.map((a) => ({
        partId: a.question_part_id,
        label: a.label,
        marksAwarded: settled.get(a.question_part_id) ?? a.marks_awarded ?? 0,
        marksPossible: a.marks,
        markingState: "SELF_MARKED",
      })),
    };
  }
}

export function buildSelfMarkModule(
  sql: SqlFn,
  publisher: GradedEvidencePublisher = noopGradedEvidencePublisher,
  clock: SubmitClock = defaultClock,
) {
  return { selfMark: new SelfMarkService(sql, publisher, clock) };
}
