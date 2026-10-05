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
 * The graded-evidence seam — publishGraded parity (EvidencePublisher.java:53):
 * resolves the claim (true = the event fired; false = suppressed/already
 * fired). The 032/033 marking lanes bind to the SAME claim + guarded-flip
 * contract recorded in T-MIG-030's seam.
 */
export interface GradedEvidencePublisher {
  publishGraded(event: {
    attemptId: string;
    learnerId: string;
    questionId: string;
    marksAwarded: number;
    marksTotal: number;
    correct: boolean;
    secondaryTopicNodeIds: string[];
    occurredAt: string;
  }): Promise<boolean>;
}

export const noopGradedEvidencePublisher: GradedEvidencePublisher = {
  publishGraded: async () => false,
};

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
    marksByPartId: Map<string, number>,
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
    // no omissions (SME: one reveal, one full pass)
    const byPartId = new Map(answers.map((a) => [a.question_part_id, a]));
    if (marksByPartId.size !== byPartId.size ||
        ![...marksByPartId.keys()].every((k) => byPartId.has(k))) {
      throw new BadRequestError("self-mark must cover exactly the attempt's parts");
    }

    for (const [partId, marks] of marksByPartId) {
      const answer = byPartId.get(partId)!;
      const bound = Math.max(answer.marks, 0);
      if (marks < 0 || (bound > 0 && marks > bound)) {
        throw new ConflictError(`marks ${marks} outside part bound 0\u2013${bound}`);
      }
    }

    // settle: answers first, then the attempt total, then evidence once
    const now = this.clock.now().toISOString();
    for (const [partId, marks] of marksByPartId) {
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
      .map((a) => marksByPartId.get(a.question_part_id) ?? a.marks_awarded ?? 0)
      .reduce((s, m) => s + m, 0);
    const correct = question.marks > 0 && totalAwarded >= question.marks;
    await this.sql`
      update attempts set marking_state = ${"SELF_MARKED"}, marks_awarded = ${totalAwarded},
      correct = ${correct}
      where id = ${attemptId}
    `;

    const secondary = (await this.sql`
      select node_id from question_topics where question_id = ${attempt.question_id}
    `) as unknown as Array<{ node_id: string }>;
    const fired = await this.publisher.publishGraded({
      attemptId,
      learnerId,
      questionId: attempt.question_id,
      marksAwarded: totalAwarded,
      marksTotal: question.marks,
      correct,
      secondaryTopicNodeIds: secondary.map((r) => String(r.node_id)),
      occurredAt: now,
    });
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
        marksAwarded: marksByPartId.get(a.question_part_id) ?? a.marks_awarded ?? 0,
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
