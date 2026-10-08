/**
 * Content-review WRITE service — the §7 validation-workflow port of the
 * frozen teacher/ContentReviewService.java write methods (:98-420, :712-759)
 * + teacher/ContentAuditRecorder.java (syllabai-core @ 6cad6ef, T-MIG-107).
 * The read half lives in review.ts (T-MIG-020); this file adds the mutation
 * half the honest-501 shells answered for since then.
 *
 * Frozen laws ported (every guard message verbatim; wire mapping via the
 * shared GlobalExceptionHandler parity in services/identity/errors):
 *   - ConflictException        → 409 "conflict"          (guard messages)
 *   - NotFoundException        → 404 "not_found"          ("X {id} not found")
 *   - IllegalStateException    → opaque 500 (plain Error → app onError
 *     "internal_error"/"an internal error occurred" — detail suppressed,
 *     the Java Exception catch-all :224-230)
 *   - the AUDIT contract (ContentAuditRecorder.record): every
 *     validate/reject/flag/unflag/place/map decision appends ONE
 *     content_review_audit row in the SAME transaction, fail-closed —
 *     a row that cannot be written rolls the mutation back.
 *     actorLabel = the reviewer's email | "system" (no principal);
 *     actor_user_id = the reviewer's user id | null.
 *
 * Transactions: each public method runs inside the caller's TxSqlFn
 * transaction (the exam-series import route precedent) — whole-mutation,
 * all-or-nothing, matching the frozen @Transactional semantics.
 *
 * Entity state machines (ExamPaper :134-150 / QuestionVersion :141-158 /
 * MarkScheme :122-138): validate()/reject() are unconditional flips;
 * flag() only from SUGGESTED/VALIDATED, unflag() only from FLAGGED —
 * otherwise IllegalStateException (→ the opaque 500 wire).
 */
import type { SqlFn } from "../identity/users";
import { ConflictException, NotFoundException } from "../identity/errors";

/** The driver-agnostic sql seam + the transaction (per-module declared). */
export type TxSqlFn = SqlFn & {
  transaction: <T>(body: (tx: SqlFn) => Promise<T>) => Promise<T>;
};

/** The reviewer identity (ContentAuditRecorder.currentActorLabel parity). */
export interface ReviewActor {
  /** authenticated reviewer's user id (null outside a request context) */
  userId: string | null;
  /** authenticated reviewer's email (the Java authentication.getName()) */
  email: string | null;
}

type Row = Record<string, unknown>;

// ── the audit recorder (ContentAuditRecorder + ContentReviewAudit) ──────────

/** The authenticated reviewer's label, or "system" (actorLabel :73 law). */
export function actorLabelOf(actor: ReviewActor | null): string {
  const name = actor?.email ?? null;
  return name == null || name.trim() === "" || name === "anonymousUser"
    ? "system"
    : name;
}

/**
 * Persist one audit row in the caller's transaction — FAIL-CLOSED: an
 * insert failure propagates and the mutation rolls back ("no promotion
 * without an audit row", ContentAuditRecorder.record).
 */
export async function recordAudit(
  tx: SqlFn,
  clock: { now: () => Date },
  actor: ReviewActor | null,
  action: string,
  targetType: string,
  targetId: string,
  fromState: string | null,
  toState: string | null,
  detail: string,
): Promise<void> {
  const label = actorLabelOf(actor);
  await tx`
    insert into content_review_audit (
      actor_user_id, actor_label, action, target_type, target_id,
      from_state, to_state, detail, occurred_at
    ) values (
      ${actor?.userId ?? null}::uuid,
      ${label},
      ${action},
      ${targetType},
      ${targetId}::uuid,
      ${fromState},
      ${toState},
      ${detail},
      ${clock.now().toISOString()}
    )`;
}

// ── the entity state machines (pure — the frozen guards, verbatim) ──────────

export type ValidationLevel = "paper" | "question version" | "mark scheme";

/**
 * ExamPaper.flag (:138-144) / QuestionVersion.flag (:145-151) /
 * MarkScheme.flag (:126-132): flag from SUGGESTED or VALIDATED only —
 * anything else is IllegalStateException (the opaque-500 wire; the message
 * is the Java log detail).
 */
export function assertFlaggable(level: ValidationLevel, state: string): void {
  if (state !== "SUGGESTED" && state !== "VALIDATED") {
    throw new Error(`${level} in state ${state} cannot be flagged`);
  }
}

/**
 * unflag (:146-150 / :153-157 / :134-137): FLAGGED only — back to SUGGESTED
 * (re-validation required, never straight back to VALIDATED).
 */
export function assertUnflaggable(level: ValidationLevel, state: string): void {
  if (state !== "FLAGGED") {
    throw new Error(`${level} in state ${state} is not flagged`);
  }
}

// ── result views (the frozen record field orders) ───────────────────────────

export interface PaperSummary {
  id: string;
  subjectId: string | null;
  title: string | null;
  paperCode: string | null;
  sessionLabel: string | null;
  board: string | null;
  qualification: string | null;
  validationState: string;
}

export interface VersionSummary {
  id: string;
  questionId: string;
  version: number;
  validationState: string;
}

export interface SchemeSummary {
  id: string;
  questionVersionId: string;
  pointCount: number;
  validationState: string;
}

export interface BatchResult {
  paperId: string;
  paperState: string;
  totalVersions: number;
  versionsValidated: number;
  schemesValidated: number;
}

export interface TopicMappingResult {
  questionId: string;
  primaryNodeId: string;
  primaryCode: string | null;
  primaryTitle: string | null;
  topicCount: number;
}

// ── row shapes (the selects below) ──────────────────────────────────────────

interface PaperRow {
  id: string;
  subject_id: string | null;
  title: string | null;
  paper_code: string | null;
  session_label: string | null;
  board: string | null;
  qualification: string | null;
  validation_state: string;
}

const paperSummaryOf = (p: PaperRow): PaperSummary => ({
  id: String(p.id),
  subjectId: p.subject_id == null ? null : String(p.subject_id),
  title: p.title == null ? null : String(p.title),
  paperCode: p.paper_code == null ? null : String(p.paper_code),
  sessionLabel: p.session_label == null ? null : String(p.session_label),
  board: p.board == null ? null : String(p.board),
  qualification: p.qualification == null ? null : String(p.qualification),
  validationState: String(p.validation_state),
});

interface VersionRow {
  id: string;
  question_id: string;
  version: number;
  validation_state: string;
}

interface SchemeRow {
  id: string;
  question_version_id: string;
  validation_state: string;
}

// ── the service ─────────────────────────────────────────────────────────────

export interface ContentReviewWriteDeps {
  sql: TxSqlFn;
  clock: { now: () => Date };
}

export class ContentReviewWriteService {
  constructor(private readonly d: ContentReviewWriteDeps) {}

  // ── paper-level ───────────────────────────────────────────────────────────

  /**
   * §7 placement (placePaper :105-122): a factual association update ONLY —
   * idempotent (same subject returns the paper un-audited, Java :111-113),
   * validation states and the serving boundary untouched. AUDIT-logged.
   */
  async placePaper(
    paperId: string,
    subjectId: string,
    actor: ReviewActor | null,
  ): Promise<PaperSummary> {
    return this.d.sql.transaction(async (tx) => {
      const paper = await this.findPaper(tx, paperId);
      const subject = await this.findSubject(tx, subjectId);
      if (subjectId === paper.subject_id) {
        return paperSummaryOf(paper);
      }
      await tx`update exam_papers set subject_id = ${subjectId}::uuid where id = ${paperId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "PLACE", "exam_paper", paperId, null, null,
        `subject ${subjectId} (${subject.code}: ${subject.name})`,
      );
      return paperSummaryOf({ ...paper, subject_id: subjectId });
    });
  }

  /**
   * validatePaper (:124-144): every version VALIDATED (else 409 naming the
   * count) + the marking contract complete (else 409), then the flip.
   */
  async validatePaper(paperId: string, actor: ReviewActor | null): Promise<PaperSummary> {
    return this.d.sql.transaction(async (tx) => {
      const paper = await this.findPaper(tx, paperId);
      const versions = await this.versionsOfPaper(tx, paperId);
      const unvalidated = versions.filter((v) => v.validation_state !== "VALIDATED").length;
      if (unvalidated > 0) {
        throw new ConflictException(
          `paper has ${unvalidated} unvalidated question version(s) — validate versions first`,
        );
      }
      await this.assertMarkingContractComplete(tx, versions, false);
      const from = paper.validation_state;
      await tx`update exam_papers set validation_state = 'VALIDATED' where id = ${paperId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "VALIDATE", "exam_paper", paperId, from, "VALIDATED",
        `${paper.paper_code} ${paper.session_label}`,
      );
      return paperSummaryOf({ ...paper, validation_state: "VALIDATED" });
    });
  }

  /** rejectPaper (:174-184): unconditional flip + audit. */
  async rejectPaper(paperId: string, actor: ReviewActor | null): Promise<PaperSummary> {
    return this.d.sql.transaction(async (tx) => {
      const paper = await this.findPaper(tx, paperId);
      const from = paper.validation_state;
      await tx`update exam_papers set validation_state = 'REJECTED' where id = ${paperId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "REJECT", "exam_paper", paperId, from, "REJECTED",
        `${paper.paper_code} ${paper.session_label}`,
      );
      return paperSummaryOf({ ...paper, validation_state: "REJECTED" });
    });
  }

  /** flagPaper (:267-278): SUGGESTED/VALIDATED only; serving blocked. */
  async flagPaper(paperId: string, actor: ReviewActor | null): Promise<PaperSummary> {
    return this.d.sql.transaction(async (tx) => {
      const paper = await this.findPaper(tx, paperId);
      const from = paper.validation_state;
      assertFlaggable("paper", from);
      await tx`update exam_papers set validation_state = 'FLAGGED' where id = ${paperId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "FLAG", "exam_paper", paperId, from, "FLAGGED",
        "serving blocked",
      );
      return paperSummaryOf({ ...paper, validation_state: "FLAGGED" });
    });
  }

  /** unflagPaper (:280-291): FLAGGED only; back to SUGGESTED. */
  async unflagPaper(paperId: string, actor: ReviewActor | null): Promise<PaperSummary> {
    return this.d.sql.transaction(async (tx) => {
      const paper = await this.findPaper(tx, paperId);
      const from = paper.validation_state;
      assertUnflaggable("paper", from);
      await tx`update exam_papers set validation_state = 'SUGGESTED' where id = ${paperId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "UNFLAG", "exam_paper", paperId, from, "SUGGESTED",
        "re-validation required",
      );
      return paperSummaryOf({ ...paper, validation_state: "SUGGESTED" });
    });
  }

  // ── question-version level ────────────────────────────────────────────────

  /** validateQuestionVersion (:187-195). */
  async validateQuestionVersion(versionId: string, actor: ReviewActor | null): Promise<VersionSummary> {
    return this.d.sql.transaction(async (tx) => {
      const version = await this.findVersion(tx, versionId);
      const from = version.validation_state;
      await tx`update question_versions set validation_state = 'VALIDATED' where id = ${versionId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "VALIDATE", "question_version", versionId, from, "VALIDATED", "",
      );
      return { id: versionId, questionId: version.question_id, version: version.version, validationState: "VALIDATED" };
    });
  }

  /** rejectQuestionVersion (:197-206). */
  async rejectQuestionVersion(versionId: string, actor: ReviewActor | null): Promise<VersionSummary> {
    return this.d.sql.transaction(async (tx) => {
      const version = await this.findVersion(tx, versionId);
      const from = version.validation_state;
      await tx`update question_versions set validation_state = 'REJECTED' where id = ${versionId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "REJECT", "question_version", versionId, from, "REJECTED", "",
      );
      return { id: versionId, questionId: version.question_id, version: version.version, validationState: "REJECTED" };
    });
  }

  /** flagQuestionVersion (:293-302): SUGGESTED/VALIDATED only. */
  async flagQuestionVersion(versionId: string, actor: ReviewActor | null): Promise<VersionSummary> {
    return this.d.sql.transaction(async (tx) => {
      const version = await this.findVersion(tx, versionId);
      const from = version.validation_state;
      assertFlaggable("question version", from);
      await tx`update question_versions set validation_state = 'FLAGGED' where id = ${versionId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "FLAG", "question_version", versionId, from, "FLAGGED",
        "serving blocked",
      );
      return { id: versionId, questionId: version.question_id, version: version.version, validationState: "FLAGGED" };
    });
  }

  /** unflagQuestionVersion (:304-312): FLAGGED only. */
  async unflagQuestionVersion(versionId: string, actor: ReviewActor | null): Promise<VersionSummary> {
    return this.d.sql.transaction(async (tx) => {
      const version = await this.findVersion(tx, versionId);
      const from = version.validation_state;
      assertUnflaggable("question version", from);
      await tx`update question_versions set validation_state = 'SUGGESTED' where id = ${versionId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "UNFLAG", "question_version", versionId, from, "SUGGESTED",
        "re-validation required",
      );
      return { id: versionId, questionId: version.question_id, version: version.version, validationState: "SUGGESTED" };
    });
  }

  // ── mark-scheme level ─────────────────────────────────────────────────────

  /**
   * validateMarkScheme (:224-252): optionally author per-point acceptance
   * criteria and the V34 generalGuidance in the SAME transaction, then
   * validate. criteria=null → validate as-is; guidance null → untouched,
   * blank → null (the isBlank ? null : strip law).
   */
  async validateMarkScheme(
    schemeId: string,
    criteriaUpdates: Array<{ markPointId: string | null; acceptanceCriteria: string[] | null }> | null,
    generalGuidance: string | null,
    actor: ReviewActor | null,
  ): Promise<SchemeSummary> {
    return this.d.sql.transaction(async (tx) => {
      const scheme = await this.findSchemeWithPoints(tx, schemeId);
      if (criteriaUpdates != null) {
        for (const update of criteriaUpdates) {
          // a NULL markPointId binds fine in the core (the element @NotNull
          // constraints are NOT cascaded — no @Valid on the List field) and
          // dies HERE as NotFound("mark point in scheme", null) → 404
          // "mark point in scheme null not found" (the Java String-concat
          // of a null identifier renders "null")
          const point =
            update.markPointId == null
              ? undefined
              : scheme.points.find((p) => p.id === update.markPointId);
          if (point === undefined) {
            throw new NotFoundException("mark point in scheme", String(update.markPointId));
          }
          if (update.acceptanceCriteria == null) {
            // setAcceptanceCriteria(null) → the column stays/becomes SQL NULL
            await tx`update mark_points set acceptance_criteria = NULL where id = ${point.id}::uuid`;
          } else {
            await tx`update mark_points set acceptance_criteria = ${JSON.stringify(update.acceptanceCriteria)}::jsonb where id = ${point.id}::uuid`;
          }
        }
      }
      let guidance: string | null | undefined = undefined; // undefined = untouched
      if (generalGuidance != null) {
        const stripped = generalGuidance.trim();
        guidance = stripped === "" ? null : stripped;
      }
      if (guidance === undefined) {
        await tx`update mark_schemes set validation_state = 'VALIDATED' where id = ${schemeId}::uuid`;
      } else {
        await tx`update mark_schemes set validation_state = 'VALIDATED', general_guidance = ${guidance} where id = ${schemeId}::uuid`;
      }
      const from = scheme.validation_state;
      await recordAudit(
        tx, this.d.clock, actor, "VALIDATE", "mark_scheme", schemeId, from, "VALIDATED",
        `${(criteriaUpdates ?? []).length} criteria updates${generalGuidance == null ? "" : " + general guidance"}`,
      );
      return {
        id: schemeId,
        questionVersionId: scheme.question_version_id,
        pointCount: scheme.points.length,
        validationState: "VALIDATED",
      };
    });
  }

  /** rejectMarkScheme (:254-263). */
  async rejectMarkScheme(schemeId: string, actor: ReviewActor | null): Promise<SchemeSummary> {
    return this.d.sql.transaction(async (tx) => {
      const scheme = await this.findScheme(tx, schemeId);
      const from = scheme.validation_state;
      await tx`update mark_schemes set validation_state = 'REJECTED' where id = ${schemeId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "REJECT", "mark_scheme", schemeId, from, "REJECTED", "",
      );
      return { id: schemeId, questionVersionId: scheme.question_version_id, pointCount: scheme.pointCount, validationState: "REJECTED" };
    });
  }

  /** flagMarkScheme (:315-324): SUGGESTED/VALIDATED only. */
  async flagMarkScheme(schemeId: string, actor: ReviewActor | null): Promise<SchemeSummary> {
    return this.d.sql.transaction(async (tx) => {
      const scheme = await this.findScheme(tx, schemeId);
      const from = scheme.validation_state;
      assertFlaggable("mark scheme", from);
      await tx`update mark_schemes set validation_state = 'FLAGGED' where id = ${schemeId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "FLAG", "mark_scheme", schemeId, from, "FLAGGED",
        "serving blocked",
      );
      return { id: schemeId, questionVersionId: scheme.question_version_id, pointCount: scheme.pointCount, validationState: "FLAGGED" };
    });
  }

  /** unflagMarkScheme (:326-335): FLAGGED only. */
  async unflagMarkScheme(schemeId: string, actor: ReviewActor | null): Promise<SchemeSummary> {
    return this.d.sql.transaction(async (tx) => {
      const scheme = await this.findScheme(tx, schemeId);
      const from = scheme.validation_state;
      assertUnflaggable("mark scheme", from);
      await tx`update mark_schemes set validation_state = 'SUGGESTED' where id = ${schemeId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "UNFLAG", "mark_scheme", schemeId, from, "SUGGESTED",
        "re-validation required",
      );
      return { id: schemeId, questionVersionId: scheme.question_version_id, pointCount: scheme.pointCount, validationState: "SUGGESTED" };
    });
  }

  // ── the batch action (V20) ────────────────────────────────────────────────

  /**
   * validateAllForPaper (:350-420): validate every SUGGESTED version +
   * scheme of the paper in ONE transaction, then the paper. Fail-closed
   * guards in the frozen order: REJECTED paper → FLAGGED paper →
   * REVIEW_REQUIRED bridge (unless forced) → blocked versions → the
   * marking contract (fail fast BEFORE mutating) → the unvalidated
   * re-check (the per-item precondition).
   */
  async validateAllForPaper(
    paperId: string,
    force: boolean,
    actor: ReviewActor | null,
  ): Promise<BatchResult> {
    return this.d.sql.transaction(async (tx) => {
      const paper = await this.findPaper(tx, paperId);
      if (paper.validation_state === "REJECTED") {
        throw new ConflictException("paper is REJECTED — validation is not possible");
      }
      if (paper.validation_state === "FLAGGED") {
        throw new ConflictException("paper is FLAGGED — unflag it before validating");
      }

      const bridge = await this.bridgeStatusForPaper(tx, paperId);
      if (bridge === "REVIEW_REQUIRED" && !force) {
        throw new ConflictException(
          "paper import has REVIEW_REQUIRED reconciliation — review its findings item-by-item, or pass force=true to validate anyway",
        );
      }

      const versions = await this.versionsOfPaper(tx, paperId);
      const blocked = versions.filter(
        (v) => v.validation_state === "REJECTED" || v.validation_state === "FLAGGED",
      ).length;
      if (blocked > 0) {
        throw new ConflictException(
          `paper has ${blocked} REJECTED/FLAGGED question version(s) — resolve them before batch validation`,
        );
      }

      // fail fast on the marking contract BEFORE mutating anything
      await this.assertMarkingContractComplete(tx, versions, force);

      let versionsValidated = 0;
      let schemesValidated = 0;
      for (const version of versions) {
        if (version.validation_state === "SUGGESTED") {
          await tx`update question_versions set validation_state = 'VALIDATED' where id = ${version.id}::uuid`;
          // the Java entity MUTATES in memory (version.validate()); the final
          // unvalidated re-check reads that state — mirror it
          version.validation_state = "VALIDATED";
          versionsValidated++;
          await recordAudit(
            tx, this.d.clock, actor, "VALIDATE", "question_version", version.id,
            "SUGGESTED", "VALIDATED", "batch validate-all",
          );
        }
        const scheme = await this.schemeForVersion(tx, version.id);
        if (scheme != null && scheme.validation_state === "SUGGESTED") {
          await tx`update mark_schemes set validation_state = 'VALIDATED' where id = ${scheme.id}::uuid`;
          scheme.validation_state = "VALIDATED"; // the in-memory flip, same law
          schemesValidated++;
          await recordAudit(
            tx, this.d.clock, actor, "VALIDATE", "mark_scheme", scheme.id,
            "SUGGESTED", "VALIDATED", "batch validate-all",
          );
        }
      }

      // the paper flip re-uses the exact per-item precondition (all VALIDATED)
      const unvalidated = versions.filter((v) => v.validation_state !== "VALIDATED").length;
      if (unvalidated > 0) {
        throw new ConflictException(
          `paper has ${unvalidated} unvalidated question version(s) — validate versions first`,
        );
      }
      const paperFrom = paper.validation_state;
      await tx`update exam_papers set validation_state = 'VALIDATED' where id = ${paperId}::uuid`;
      await recordAudit(
        tx, this.d.clock, actor, "VALIDATE_ALL", "exam_paper", paperId, paperFrom, "VALIDATED",
        `${versionsValidated} versions + ${schemesValidated} schemes, force=${force}`,
      );
      return {
        paperId: paper.id,
        paperState: "VALIDATED",
        totalVersions: versions.length,
        versionsValidated,
        schemesValidated,
      };
    });
  }

  // ── §10 topic mapping ─────────────────────────────────────────────────────

  /**
   * mapQuestionTopics (:712-759): replaces the question's topic rows
   * atomically — primary becomes questions.primary_topic_node_id AND a
   * primary question_topics row; secondaries (optional, deduplicated, max
   * 5, primary-equals skipped) become non-primary rows. Ingestion anchors
   * (code ING-*) are refused 409 at both tiers. The delete precedes the
   * inserts (the Java flush() barrier is free in SQL — sequential
   * statements in the tx). AUDIT-logged (MAP_TOPICS).
   */
  async mapQuestionTopics(
    questionId: string,
    primaryNodeId: string,
    secondaryNodeIds: Array<string | null> | null,
    actor: ReviewActor | null,
  ): Promise<TopicMappingResult> {
    return this.d.sql.transaction(async (tx) => {
      await this.findQuestion(tx, questionId);
      const primary = await this.findNode(tx, primaryNodeId);
      if (primary.code != null && primary.code.startsWith("ING-")) {
        throw new ConflictException(
          `primary topic ${primary.code} is an ingestion anchor — pick a real curriculum topic`,
        );
      }

      const secondaries: Array<string | null> = [];
      if (secondaryNodeIds != null) {
        for (const id of secondaryNodeIds) {
          if (id === primaryNodeId) {
            continue; // the primary row already covers it
          }
          // NOTE: no seen-set short-circuit here — the Java looks up and
          // anchor-checks EVERY id (duplicates included) and the LinkedHashSet
          // add() merely no-ops; only the final row set dedups.
          // A null id binds through Jackson's List<UUID> unvalidated (no
          // constraint on the elements) and dies in findById(null) →
          // NotFound("curriculum topic", null) — 404 "curriculum topic null
          // not found" — WITHOUT a query (a null id never reaches SQL).
          const node = id == null ? null : await this.findNode(tx, id);
          if (node == null) {
            throw new NotFoundException("curriculum topic", String(id));
          }
          if (node.code != null && node.code.startsWith("ING-")) {
            throw new ConflictException(
              `secondary topic ${node.code} is an ingestion anchor — pick real curriculum topics`,
            );
          }
          if (id != null && secondaries.includes(id)) {
            continue; // LinkedHashSet add() no-ops for a duplicate
          }
          secondaries.push(id);
          if (secondaries.length >= 5) {
            break; // multi-topic, not a keyword dump
          }
        }
      }

      await tx`update questions set primary_topic_node_id = ${primaryNodeId}::uuid where id = ${questionId}::uuid`;
      await tx`delete from question_topics where question_id = ${questionId}::uuid`;
      await tx`insert into question_topics (id, question_id, node_id, is_primary, created_at) values (${crypto.randomUUID()}::uuid, ${questionId}::uuid, ${primaryNodeId}::uuid, true, ${this.d.clock.now().toISOString()})`;
      for (const secondary of secondaries) {
        if (secondary == null) continue; // a null id wrote no row in the core either
        await tx`insert into question_topics (id, question_id, node_id, is_primary, created_at) values (${crypto.randomUUID()}::uuid, ${questionId}::uuid, ${secondary}::uuid, false, ${this.d.clock.now().toISOString()})`;
      }
      await recordAudit(
        tx, this.d.clock, actor, "MAP_TOPICS", "question", questionId, null, null,
        `primary ${primary.code ?? "null"} + ${secondaries.length} secondary`,
      );
      return {
        questionId,
        primaryNodeId,
        primaryCode: primary.code,
        primaryTitle: primary.title,
        topicCount: secondaries.length + 1,
      };
    });
  }

  // ── shared internals ──────────────────────────────────────────────────────

  /** NotFoundException("exam paper", id) — the read-side message law. */
  private async findPaper(tx: SqlFn, paperId: string): Promise<PaperRow> {
    const rows: Row[] = await tx`
      select id, subject_id, title, paper_code, session_label, board, qualification, validation_state
      from exam_papers where id = ${paperId}::uuid`;
    const row = rows[0];
    if (row === undefined) throw new NotFoundException("exam paper", paperId);
    return {
      id: String(row.id),
      subject_id: row.subject_id == null ? null : String(row.subject_id),
      title: row.title == null ? null : String(row.title),
      paper_code: row.paper_code == null ? null : String(row.paper_code),
      session_label: row.session_label == null ? null : String(row.session_label),
      board: row.board == null ? null : String(row.board),
      qualification: row.qualification == null ? null : String(row.qualification),
      validation_state: String(row.validation_state),
    };
  }

  private async findSubject(
    tx: SqlFn,
    subjectId: string,
  ): Promise<{ id: string; code: string | null; name: string | null }> {
    const rows: Row[] = await tx`
      select id, code, name from subjects where id = ${subjectId}::uuid`;
    const row = rows[0];
    if (row === undefined) throw new NotFoundException("subject", subjectId);
    return {
      id: String(row.id),
      code: row.code == null ? null : String(row.code),
      name: row.name == null ? null : String(row.name),
    };
  }

  /**
   * findByPaperId parity — order by v.question.external_ref nulls last,
   * v.version desc (QuestionVersionRepository.java :46-51).
   */
  private async versionsOfPaper(tx: SqlFn, paperId: string): Promise<VersionRow[]> {
    const rows: Row[] = await tx`
      select v.id, v.question_id, v.version, v.validation_state
      from question_versions v
      join questions q on q.id = v.question_id
      where q.exam_paper_id = ${paperId}::uuid
      order by q.external_ref asc nulls last, v.version desc`;
    return rows.map((r) => ({
      id: String(r.id),
      question_id: String(r.question_id),
      version: Number(r.version),
      validation_state: String(r.validation_state),
    }));
  }

  private async findVersion(tx: SqlFn, versionId: string): Promise<VersionRow> {
    const rows: Row[] = await tx`
      select id, question_id, version, validation_state
      from question_versions where id = ${versionId}::uuid`;
    const row = rows[0];
    if (row === undefined) throw new NotFoundException("question version", versionId);
    return {
      id: String(row.id),
      question_id: String(row.question_id),
      version: Number(row.version),
      validation_state: String(row.validation_state),
    };
  }

  private async findScheme(tx: SqlFn, schemeId: string): Promise<SchemeRow & { pointCount: number }> {
    const rows: Row[] = await tx`
      select s.id, s.question_version_id, s.validation_state,
             (select count(*) from mark_points mp where mp.mark_scheme_id = s.id) as point_count
      from mark_schemes s where s.id = ${schemeId}::uuid`;
    const row = rows[0];
    if (row === undefined) throw new NotFoundException("mark scheme", schemeId);
    return {
      id: String(row.id),
      question_version_id: String(row.question_version_id),
      validation_state: String(row.validation_state),
      pointCount: Number(row.point_count),
    };
  }

  /** findWithPoints parity: the scheme plus its points (id + ordering). */
  private async findSchemeWithPoints(
    tx: SqlFn,
    schemeId: string,
  ): Promise<SchemeRow & { points: Array<{ id: string }> }> {
    const scheme = await this.findScheme(tx, schemeId);
    const pointRows: Row[] = await tx`
      select mp.id from mark_points mp where mp.mark_scheme_id = ${schemeId}::uuid order by mp.ordering asc`;
    return {
      ...scheme,
      points: pointRows.map((p) => ({ id: String(p.id) })),
    };
  }

  /** findFirstByQuestionVersionIdOrderByCreatedAtDesc parity. */
  private async schemeForVersion(tx: SqlFn, versionId: string): Promise<SchemeRow | null> {
    const rows: Row[] = await tx`
      select id, question_version_id, validation_state
      from mark_schemes where question_version_id = ${versionId}::uuid
      order by created_at desc limit 1`;
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: String(row.id),
      question_version_id: String(row.question_version_id),
      validation_state: String(row.validation_state),
    };
  }

  /** GlmOcrBridgeRecordRepository.findByPaperId → reconciliationStatus | null. */
  private async bridgeStatusForPaper(tx: SqlFn, paperId: string): Promise<string | null> {
    const rows: Row[] = await tx`
      select reconciliation_status from glm_ocr_bridge_records where paper_id = ${paperId}::uuid`;
    const row = rows[0];
    return row === undefined ? null : String(row.reconciliation_status);
  }

  private async findQuestion(tx: SqlFn, questionId: string): Promise<void> {
    const rows: Row[] = await tx`
      select id from questions where id = ${questionId}::uuid`;
    if (rows[0] === undefined) throw new NotFoundException("question", questionId);
  }

  private async findNode(
    tx: SqlFn,
    nodeId: string,
  ): Promise<{ id: string; code: string | null; title: string | null }> {
    const rows: Row[] = await tx`
      select id, code, title from knowledge_nodes where id = ${nodeId}::uuid`;
    const row = rows[0];
    if (row === undefined) throw new NotFoundException("curriculum topic", nodeId);
    return {
      id: String(row.id),
      code: row.code == null ? null : String(row.code),
      title: row.title == null ? null : String(row.title),
    };
  }

  /**
   * §7 marking-contract completeness (:155-172): a version with NO mark
   * scheme can never be marked — the paper must not go VALIDATED while any
   * version lacks its scheme, unless the reviewer explicitly forces it.
   */
  private async assertMarkingContractComplete(
    tx: SqlFn,
    versions: VersionRow[],
    force: boolean,
  ): Promise<void> {
    if (force) {
      return;
    }
    let schemeless = 0;
    for (const version of versions) {
      const scheme = await this.schemeForVersion(tx, version.id);
      if (scheme == null) schemeless++;
    }
    if (schemeless > 0) {
      throw new ConflictException(
        `paper has ${schemeless} question version(s) without any mark scheme — the deterministic` +
          " marking contract is incomplete; author the schemes first or pass" +
          " force=true to validate anyway",
      );
    }
  }
}
