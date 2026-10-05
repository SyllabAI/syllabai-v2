/**
 * AssessmentService port — the two submission use cases (T-MIG-030 tranche 1;
 * AssessmentService.java, syllabai-core @ 6cad6ef, 217 lines).
 *
 * MCQ submit law (:77-120):
 *   1. questions.findWithOptions(questionId).filter(active) → else NotFound
 *      ("question", questionId)                                   [404]
 *   2. STRUCTURED type only: current version =
 *      questionVersions.findByQuestionIdOrderByVersionDesc() first row (may
 *      be null); ServableQuestionSpec fails → NotFound("question", questionId)
 *      [404, fail-closed, no state echo] — MCQ skips this branch
 *   3. assertPaperAllowsServing (:55-63): question.examPaperId != null AND
 *      examPapers.findIdsBlockingServing() (validationState in REJECTED,
 *      FLAGGED — full tiny list, verbatim) contains it → NotFound("question",
 *      questionId)                                                [404]
 *   4. chosen option = the loaded option with id == chosenOptionId → else
 *      NotFound("option", chosenOptionId)                         [404]
 *   5. correct = chosen.correct; marksAwarded = correct ? question.marks : 0
 *   6. INSERT attempt (markingState AUTO_GRADED, evidenceEmitted false,
 *      provenance = timedCondition ? "web-quiz-v0-timed" : "web-quiz-v0"
 *      (:214-216))
 *   7. secondary topics = questionTopics.findByQuestionId (evidence event
 *      payload only); expressed = chosen.misconceptionNodeId as a 1-element
 *      list or empty; observed = distinct non-null option misconception ids
 *      (:206-212); evidencePublisher.publishMcq(...) — Observer seam
 *      (Master Spec §12/§23: this service NEVER updates mastery itself)
 *   8. correctOptionLabel = first correct option's label or null
 *   9. Return AttemptResultView (submittedAt = the attempt row's createdAt).
 *
 * Structured submit law (:137-204):
 *   1. questions.findById.filter(active).filter(type == STRUCTURED) → else
 *      NotFound("structured question", questionId)                [404]
 *   2. current version → else NotFound("question version", questionId) [404]
 *   3. ServableQuestionSpec fails → NotFound("structured question",
 *      questionId)                                     [404 fail-closed]
 *   4. assertPaperAllowsServing (same as MCQ)
 *   5. version.parts() (@OrderBy("ordering")) empty → NotFound("parts for
 *      question version", versionId)                              [404]
 *   6. duplicate partId in request OR missing part → IllegalArgumentException
 *      ("duplicate answer for part {id}" / "missing answer for part '{label}'")
 *      — GlobalExceptionHandler.java:167-170 maps IllegalArgumentException to
 *      400 bad_request with the FIXED client message "malformed request"
 *      (the detailed message reaches the log only); the port throws
 *      BadRequestException("malformed request") for the same observable body
 *   7. INSERT attempt (chosenOptionId null, correct false, marksAwarded null,
 *      markingState PENDING via beginMarking(), provenance =
 *      "web-structured-v1" + (timedCondition ? "-timed" : "")  (:186-189))
 *   8. INSERT one answer per part, in @OrderBy("ordering") part order;
 *      answerText = null → "" else trim() (:193-197)
 *   9. Return StructuredAttemptResultView — parts all PENDING with
 *      marksAwarded null; no evidence emission at submit (V8: fires exactly
 *      once at first authoritative marking — NOT this slice's concern).
 *
 * ID/clock injection: Java's @PrePersist generates UUID + Instant.now(); the
 * port takes optional {newId, now} providers (default crypto.randomUUID /
 * new Date()) so unit tests pin deterministic values.
 */
import type { SqlFn } from "./sql";
import { NotFoundException, BadRequestException } from "../identity/errors";
import type {
  AttemptResultView,
  StructuredAttemptResultView,
  SubmitAnswerRequest,
  StructuredSubmitRequest,
  AttemptMarkingState,
  AnswerMarkingState,
  QuestionType,
} from "./types";

/** Frozen repo law: ExamPaperRepository.findIdsBlockingServing verbatim. */
const BLOCKING_PAPER_STATES = ["REJECTED", "FLAGGED"] as const;

/**
 * Observer seam — EvidencePublisher.publishMcq parity (Master Spec §12/§23).
 * The event payload is the evidence contract's observable core; the golden
 * surface never sees it (HTTP-only capture), so the shape stays minimal and
 * the default publisher is a no-op. Structured submits emit NOTHING here
 * (V8: evidence fires at first authoritative marking — the marking lanes'
 * concern, T-MIG-032/033 territory).
 *
 * E-1 BINDING (R0, T-MIG-030 tranche-1 ratification, daad88e): the seam
 * maintains attempts.evidence_emitted per EvidencePublisher.java:37/53 +
 * Attempt.java:159-161 — publishMcq is a CLAIM: resolves true when the
 * event fired (Attempt.markEvidenceEmitted parity), false when suppressed;
 * the service flips the persisted flag AFTER a successful publish with the
 * once-only guarded update (where evidence_emitted = false — idempotent,
 * second publish is a no-op). The T-MIG-032/033 marking lanes' publishGraded
 * sites bind to the SAME claim + guarded-flip contract (publishGraded
 * returns false when evidence already fired — EvidencePublisher.java:53).
 */
export interface EvidencePublisher {
  publishMcq(event: {
    attemptId: string;
    learnerId: string;
    questionId: string;
    chosenOptionId: string;
    correct: boolean;
    marksAwarded: number;
    secondaryTopicNodeIds: string[];
    expressedMisconceptionIds: string[];
    observedMisconceptionIds: string[];
    occurredAt: string;
  }): Promise<boolean>;
}

export const noopEvidencePublisher: EvidencePublisher = {
  publishMcq: async () => false,
};

interface QuestionRow {
  id: string;
  question_type: QuestionType;
  marks: number;
  exam_paper_id: string | null;
  active: boolean;
}

interface OptionRow {
  id: string;
  label: string;
  is_correct: boolean;
  misconception_node_id: string | null;
}

export interface SubmitClock {
  newId(): string;
  now(): Date;
}

export class AssessmentSubmitter {
  constructor(
    private readonly sql: SqlFn,
    private readonly publisher: EvidencePublisher,
    private readonly clock: SubmitClock = {
      newId: () => crypto.randomUUID(),
      now: () => new Date(),
    },
  ) {}

  async submit(learnerId: string, request: SubmitAnswerRequest): Promise<AttemptResultView> {
    // 1. findWithOptions + active filter (one statement + the options
    //    statement — EntityGraph fetch split, boundary unchanged).
    const questionRows = (await this.sql`
      select id, question_type, marks, exam_paper_id, active
      from questions
      where id = ${request.questionId}
    `) as unknown as QuestionRow[];
    const question = questionRows[0];
    if (!question || !question.active) {
      throw new NotFoundException("question", request.questionId);
    }

    // 2. STRUCTURED serving gate (ServableQuestionSpec via the write path).
    if (question.question_type === "STRUCTURED") {
      const versionRows = await this.sql`
        select validation_state from question_versions
        where question_id = ${question.id}
        order by version desc
      `;
      const current = versionRows[0] as { validation_state: string } | undefined;
      const servable = current !== undefined && current.validation_state === "VALIDATED";
      if (!servable) {
        throw new NotFoundException("question", request.questionId);
      }
    }

    // 3. V20 paper-level gate (fail-closed 404, no state echo).
    await this.assertPaperAllowsServing(question);

    // 4. chosen option (options were loaded with the question in Java).
    const optionRows = (await this.sql`
      select id, label, is_correct, misconception_node_id
      from question_options
      where question_id = ${question.id}
      order by ordering
    `) as unknown as OptionRow[];
    const chosen = optionRows.find((o) => o.id === request.chosenOptionId);
    if (!chosen) {
      throw new NotFoundException("option", request.chosenOptionId);
    }

    // 5. the MCQ auto-grade law.
    const correct = chosen.is_correct;
    const marksAwarded = correct ? question.marks : 0;

    // 6. INSERT the attempt (AUTO_GRADED, evidence not yet emitted).
    const attemptId = this.clock.newId();
    const createdAt = this.clock.now();
    const provenance = request.timedCondition ? "web-quiz-v0-timed" : "web-quiz-v0";
    await this.sql`
      insert into attempts
        (id, learner_id, question_id, chosen_option_id, correct, marks_awarded,
         response_time_ms, confidence_level, self_doubt_flag, timed_condition,
         marking_state, evidence_emitted, provenance, created_at)
      values
        (${attemptId}, ${learnerId}, ${question.id}, ${chosen.id}, ${correct},
         ${marksAwarded}, ${request.responseTimeMs}, ${request.confidence},
         ${request.selfDoubtFlag}, ${request.timedCondition},
         ${"AUTO_GRADED"}, ${false}, ${provenance}, ${createdAt.toISOString()})
    `;

    // 7. evidence event (Observer seam — never a mastery update here).
    const secondary = await this.sql`
      select node_id from question_topics where question_id = ${question.id}
    `;
    const secondaryTopicNodeIds = secondary.map((r) => String(r.node_id));
    const expressedMisconceptionIds =
      chosen.misconception_node_id === null ? [] : [chosen.misconception_node_id];
    const observedMisconceptionIds = [
      ...new Set(
        optionRows
          .map((o) => o.misconception_node_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    const fired = await this.publisher.publishMcq({
      attemptId,
      learnerId,
      questionId: question.id,
      chosenOptionId: chosen.id,
      correct,
      marksAwarded,
      secondaryTopicNodeIds,
      expressedMisconceptionIds,
      observedMisconceptionIds,
      occurredAt: createdAt.toISOString(),
    });
    if (fired) {
      // E-1: the persisted flag tracks the claim (Attempt.java:159-161 —
      // markEvidenceEmitted parity; the frozen core lands true via the
      // managed-entity dirty check). The `and evidence_emitted = false`
      // guard makes the flip once-only: a second publish is a no-op, and
      // the T-MIG-032/033 marking lanes bind to this same guarded flip.
      await this.sql`
        update attempts set evidence_emitted = true
        where id = ${attemptId} and evidence_emitted = false
      `;
    }

    // 8-9. correct label + the wire view.
    const correctOptionLabel = optionRows.find((o) => o.is_correct)?.label ?? null;
    return {
      attemptId,
      questionId: question.id,
      correct,
      marksAwarded,
      marksTotal: question.marks,
      correctOptionLabel,
      implicatedMisconceptionIds: expressedMisconceptionIds,
      submittedAt: createdAt.toISOString(),
    };
  }

  async submitStructured(
    learnerId: string,
    request: StructuredSubmitRequest,
  ): Promise<StructuredAttemptResultView> {
    // 1. active + STRUCTURED filter → "structured question" 404.
    const questionRows = (await this.sql`
      select id, question_type, marks, exam_paper_id, active
      from questions
      where id = ${request.questionId}
    `) as unknown as QuestionRow[];
    const question = questionRows[0];
    if (!question || !question.active || question.question_type !== "STRUCTURED") {
      throw new NotFoundException("structured question", request.questionId);
    }

    // 2. current version (highest version number) → "question version" 404.
    const versionRows = await this.sql`
      select id, validation_state from question_versions
      where question_id = ${question.id}
      order by version desc
    `;
    const version = versionRows[0] as { id: string; validation_state: string } | undefined;
    if (!version) {
      throw new NotFoundException("question version", question.id);
    }

    // 3. serving boundary at the write path (VALIDATED only, fail-closed).
    if (version.validation_state !== "VALIDATED") {
      throw new NotFoundException("structured question", request.questionId);
    }

    // 4. V20 paper-level gate.
    await this.assertPaperAllowsServing(question);

    // 5. parts in @OrderBy("ordering") order; empty → 404.
    const partRows = (await this.sql`
      select id, label, marks from question_parts
      where question_version_id = ${version.id}
      order by ordering
    `) as unknown as Array<{ id: string; label: string; marks: number }>;
    if (partRows.length === 0) {
      throw new NotFoundException("parts for question version", version.id);
    }

    // 6. duplicate / missing part answers → the fixed 400 body
    //    (IllegalArgumentException advice parity — detail is log-only).
    const byPartId = new Map<string, unknown>();
    for (const pa of request.partAnswers) {
      if (byPartId.has(pa.partId)) {
        throw new BadRequestException("malformed request");
      }
      byPartId.set(pa.partId, pa);
    }
    for (const part of partRows) {
      if (!byPartId.has(part.id)) {
        throw new BadRequestException("malformed request");
      }
    }

    // 7. INSERT the attempt (PENDING via beginMarking, no chosen option,
    //    no marks yet).
    const attemptId = this.clock.newId();
    const createdAt = this.clock.now();
    const provenance = request.timedCondition
      ? "web-structured-v1-timed"
      : "web-structured-v1";
    await this.sql`
      insert into attempts
        (id, learner_id, question_id, chosen_option_id, correct, marks_awarded,
         response_time_ms, confidence_level, self_doubt_flag, timed_condition,
         marking_state, evidence_emitted, provenance, created_at)
      values
        (${attemptId}, ${learnerId}, ${question.id}, ${null}, ${false}, ${null},
         ${request.responseTimeMs}, ${request.confidence},
         ${request.selfDoubtFlag}, ${request.timedCondition},
         ${"PENDING"}, ${false}, ${provenance}, ${createdAt.toISOString()})
    `;

    // 8. one answer per part, in part order; null text → "" else trim.
    const partResults: Array<{
      partId: string;
      label: string;
      marksPossible: number;
      markingState: AnswerMarkingState;
      marksAwarded: number | null;
    }> = [];
    for (const part of partRows) {
      const pa = request.partAnswers.find((p) => p.partId === part.id)!;
      const answerText = pa.answerText === null ? "" : pa.answerText.trim();
      await this.sql`
        insert into answers
          (id, attempt_id, question_part_id, answer_text, marks_awarded,
           marking_state, created_at)
        values
          (${this.clock.newId()}, ${attemptId}, ${part.id}, ${answerText},
           ${null}, ${"PENDING"}, ${this.clock.now().toISOString()})
      `;
      partResults.push({
        partId: part.id,
        label: part.label,
        marksPossible: part.marks,
        markingState: "PENDING",
        marksAwarded: null,
      });
    }

    // 9. the wire view (markingState "PENDING", no evidence emission).
    return {
      attemptId,
      questionId: question.id,
      marksPossible: question.marks,
      markingState: "PENDING" as AttemptMarkingState,
      submittedAt: createdAt.toISOString(),
      parts: partResults,
    };
  }

  /**
   * AssessmentService.java:55-63 — paper-less questions (SEED_DEMO orphans)
   * pass; a question under a REJECTED/FLAGGED paper is refused exactly like
   * unvalidated content. The blocking-id list is loaded whole (tiny,
   * content-review states) — verbatim call shape.
   */
  private async assertPaperAllowsServing(question: QuestionRow): Promise<void> {
    if (question.exam_paper_id === null) {
      return;
    }
    const blocking = await this.sql`
      select id from exam_papers
      where validation_state in (${"REJECTED"}, ${"FLAGGED"})
    `;
    const blockingIds = blocking.map((r) => String(r.id));
    if (blockingIds.includes(question.exam_paper_id)) {
      throw new NotFoundException("question", question.id);
    }
  }
}
