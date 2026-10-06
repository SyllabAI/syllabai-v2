/**
 * The ResourceContext port (T-MIG-067 tranche-1a) — frozen source:
 * syllabai-core @ 6cad6ef cla/ResourceContext.java :62-235, line-against-line.
 *
 * The server-resolved anchor of "what the learner is looking at". The client
 * NEVER asserts context semantics — it passes opaque references and the
 * server resolves them fail-closed (the resolver, tranche-1b). Resolution is
 * server-side and fail-closed (unresolvable = 4xx, never a best-effort
 * guess); the validation state is resolved server-side and gates evidence
 * assembly; contexts are per-request and stateless — the CLA keeps no
 * server-side hidden session memory.
 *
 * Ids are strings (the v2 UUID-as-string convention). The record's `with`
 * methods port as spread-based pure copies (the resolver-internal enrich
 * step: base spine resolves first, then the deterministic lesson decision /
 * note identity attaches WITHOUT re-running the gates).
 */

/** ResourceContext.Kind :172-187 — closed enum, extensible by decision only. */
export type ClaContextKind =
  | "SPECIFICATION_POINT"
  | "KG_TOPIC"
  | "NOTE_SECTION"
  | "QUESTION_PART"
  | "SMART_LESSON"
  | "PAST_PAPER_QUESTION";

/** CurriculumVersionInfo :161-168 — curriculum identity resolved from the
 *  owning subject, never from the client. */
export interface ClaCurriculumVersionInfo {
  code: string;
  board: string;
  qualification: string;
  status: string;
}

/**
 * LessonActionInfo :107-135 — the learner's OWN deterministic Smart Lesson
 * decision carried on a SMART_LESSON context (the existing smart-lesson/v2
 * ladder over the SAME learner model the Smart Lesson surface consumes — no
 * new learner state, no LLM). Strings for the action/reason enums keep the
 * CLA decoupled from the learner DTO's enum identity. Framing state
 * (§2.3), never a source of educational truth.
 */
export interface ClaLessonActionInfo {
  actionType: string;
  reasonCode: string;
  targetNodeId: string | null;
  targetCode: string | null;
  targetTitle: string | null;
  reasonDetail: string;
  servableQuestionCount: number;
}

/** The ResourceContext record :62-101 — field-for-field. */
export interface ClaResourceContext {
  kind: ClaContextKind;
  /** the resolved anchor id (KG topic node id, or the question id for PAST_PAPER_QUESTION) */
  reference: string;
  /** the KG topic the context is anchored to — the deterministic spec anchor */
  topicNodeId: string;
  /** the subject KG root the request was scoped to */
  rootId: string;
  /** owning subject code (isolation + provenance) */
  subjectCode: string;
  /** canonical KG code of the anchor topic */
  topicCode: string;
  /** canonical title of the anchor topic */
  topicTitle: string;
  /** curriculum identity RESOLVED from the anchor */
  curriculumVersion: ClaCurriculumVersionInfo;
  /** resolved server-side from the store (only VALIDATED passes the gate) */
  validationState: string;
  /** provenance: the learner this request belongs to */
  learnerId: string;
  /** provenance: resolution time (ISO instant) */
  resolvedAt: string;
  /** question-anchored contexts: the served stem (null on KG_TOPIC) */
  questionStem: string | null;
  /** question-anchored contexts: command word (nullable) */
  questionCommandWord: string | null;
  /** question-anchored contexts: total marks (0 on KG_TOPIC) */
  questionMarks: number;
  /** question-anchored contexts: exam paper code (nullable) */
  paperCode: string | null;
  /** DETERMINISTIC attempt-state read (the §7.3/§7.4 gate input); null on KG_TOPIC */
  attempted: boolean | null;
  /** QUESTION_PART contexts: the anchored part's label on the CURRENT validated version */
  partLabel: string | null;
  /** SMART_LESSON contexts: the ladder's honest decision; null on every other kind */
  lessonAction: ClaLessonActionInfo | null;
  /** NOTE_SECTION contexts: the note's stable business id; null on every other kind */
  noteId: string | null;
  /** NOTE_SECTION contexts: the note's canonical title; null on every other kind */
  noteTitle: string | null;
}

/**
 * question-anchored context predicate (:196-203): both question-level
 * (PAST_PAPER_QUESTION) and part-level (QUESTION_PART) anchors are
 * assessment content — the leakage gate treats them identically.
 */
export function isQuestionContext(c: ClaResourceContext): boolean {
  return c.kind === "PAST_PAPER_QUESTION" || c.kind === "QUESTION_PART";
}

/** part-level anchor predicate (:205-207) */
export function isQuestionPartContext(c: ClaResourceContext): boolean {
  return c.kind === "QUESTION_PART";
}

/**
 * topic-anchored predicate (:217-224): KG_TOPIC, SMART_LESSON and
 * NOTE_SECTION share the identical curriculum spine and the identical
 * tutor-parity evidence rules — topic-anchored learning contexts, NOT
 * assessment content.
 */
export function isTopicContext(c: ClaResourceContext): boolean {
  return c.kind === "KG_TOPIC" || c.kind === "SMART_LESSON" || c.kind === "NOTE_SECTION";
}

/** note-anchored context predicate (:226-228, the note-lead evidence branch) */
export function isNoteContext(c: ClaResourceContext): boolean {
  return c.kind === "NOTE_SECTION";
}

/**
 * Copy with the lesson action attached (:230-236, resolver-internal: the
 * base spine resolves first, then the decision enriches it without
 * re-running the gates).
 */
export function withLessonAction(
  c: ClaResourceContext,
  lessonAction: ClaLessonActionInfo | null,
): ClaResourceContext {
  return { ...c, lessonAction };
}

/**
 * Copy with the note identity attached (:238-249, resolver-internal: the
 * curriculum spine resolves first — fail-closed through the spec-point gate
 * — then the note's own identity enriches it).
 */
export function withNote(
  c: ClaResourceContext,
  noteId: string,
  noteTitle: string,
): ClaResourceContext {
  return { ...c, noteId, noteTitle };
}
