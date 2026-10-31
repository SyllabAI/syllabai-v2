/**
 * T-TEACHME-001 · run-002 · apps/api/src/teach-me/types.ts
 *
 * The Teach-Me module's PORTS. The service (service.ts) is pure law; the
 * composition root (index.ts) injects the real store (sql.ts over the house
 * SqlFn seam) and THE ONE LLM CHAIN OF RECORD. Tests inject in-memory fakes —
 * no test ever touches Neon or a live provider (T-MIG-039 law).
 */

/** The house structural sql seam (services/learner-pdf-drawings/sql.ts precedent). */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<Array<Record<string, unknown>>>;

/** The ONE chain of record, narrowed to the shape Teach-Me uses (bridges.ts posture). */
export interface TeachMeChain {
  available(): boolean;
  generate(request: {
    system: string;
    user: string;
    temperature?: number | null;
    maxTokens?: number | null;
  }): Promise<{
    text: string;
    model: string;
    providerName: string;
    finishReason?: string | null;
  }>;
}

/** ADR-031 determinism law — the clock is injected, never captured. */
export interface Clock {
  now(): Date;
}

export interface TeachMeObjectiveRow {
  id: string;
  sessionId: string;
  ordinal: number; // 1..4, assigned server-side (the LLM never numbers)
  text: string;
  specPointIds: string[];
  status: "not_started" | "covered" | "not_covered" | "flagged";
  createdAt: string;
}

export interface TeachMeSessionRow {
  id: string;
  userId: string;
  courseId: string;
  specPointIds: string[];
  difficulty: "easy" | "medium" | "hard";
  length: "quick" | "in_depth";
  mode: "chat";
  status: "active" | "review_pending" | "completed" | "abandoned";
  messageCount: number;
  llmCallCount: number;
  tokensUsed: number;
  flags: Record<string, unknown>;
  createdAt: string;
  endedAt: string | null;
}

export interface TeachMeMessageRow {
  id: string;
  sessionId: string;
  seq: number; // student-turn ordinal; pupil rows carry the turn they reply to (opening = 0)
  role: "student" | "pupil";
  kind: "opening" | "paraphrase_probe" | "clarify_nudge" | "confusion" | null;
  text: string;
  createdAt: string;
}

export interface TeachMeCoverageRow {
  id: string;
  sessionId: string;
  objectiveId: string;
  messageSeq: number;
  covered: boolean;
  evidenceQuote: string;
  verdict: string;
  contradictionDetected: boolean;
  createdAt: string;
}

export interface TeachMeCandidateRow {
  id: string;
  sessionId: string;
  specPointIds: string[];
  statement: string;
  matchedMisconceptionId: string | null;
  confidence: number;
  status: "candidate";
  createdAt: string;
}

/** G1 canon rows — knowledge_nodes SPEC_POINT entries by code. */
export interface SpecPointCanonRow {
  id: string; // knowledge_nodes.id (uuid) — the FK-space id anchors use
  code: string; // the session's specPointId of record
  title: string;
  description: string | null;
}

export interface ReviewInputBundle {
  /** MISCONCEPTION registry excerpt (knowledge_nodes node_type='MISCONCEPTION') for these points. */
  registry: Array<{ code: string; statement: string }>;
  /** Real past-paper parts bound to these spec points (questions ⋈ question_spec_points ⋈ exam_papers). */
  anchors: Array<{ specPointId: string; paperRef: string; questionRef: string }>;
  /** Real course practice resources (revision-note links + question-bank paper links). */
  practice: Array<{ label: string; resourceType: "question_bank" | "revision_notes" | "past_paper"; href: string }>;
}

/**
 * The store port. The real implementation (sql.ts) maps every method onto the
 * run-001/002 teach_* tables; tests provide the in-memory fake (fixtures.ts).
 */
export interface TeachMeStore {
  countSessionsToday(userId: string, dayStartUtc: Date): Promise<number>;
  insertSession(session: TeachMeSessionRow, objectives: TeachMeObjectiveRow[]): Promise<void>;
  findSession(id: string): Promise<{ session: TeachMeSessionRow; objectives: TeachMeObjectiveRow[] } | null>;
  updateSession(
    id: string,
    patch: Partial<Pick<TeachMeSessionRow, "status" | "messageCount" | "llmCallCount" | "tokensUsed" | "endedAt" | "flags">>,
  ): Promise<void>;
  appendMessage(row: TeachMeMessageRow): Promise<void>;
  listMessages(sessionId: string): Promise<TeachMeMessageRow[]>;
  appendCoverage(rows: TeachMeCoverageRow[]): Promise<void>;
  listCoverage(sessionId: string): Promise<TeachMeCoverageRow[]>;
  /** Coverage rows of THIS user in OTHER sessions within the dedupe window (D4). */
  recentCreditSpecPointIds(userId: string, specPointIds: string[], sinceUtc: Date): Promise<string[]>;
  insertMisconceptionCandidates(rows: TeachMeCandidateRow[]): Promise<number>; // returns rows actually inserted
  insertReviewCard(sessionId: string, card: Record<string, unknown>, createdAt: string): Promise<void>;
  findReviewCard(sessionId: string): Promise<Record<string, unknown> | null>;
  updateObjectivesStatus(objectiveIds: string[], status: TeachMeObjectiveRow["status"]): Promise<void>;
  listSessions(userId: string, courseId: string | null): Promise<Array<TeachMeSessionRow>>;

  // ── course-input loaders (the G1–G3 content gate + review inputs) ──
  loadSpecPointCanon(specPointCodes: string[]): Promise<SpecPointCanonRow[]>;
  /** Revision-note bodies bound to these spec points — the verbatim-overlap ground (G2/D4). */
  loadNoteCorpus(specPointCodes: string[]): Promise<Array<{ noteId: string; title: string; bodyMd: string }>>;
  loadReviewInputs(input: {
    specPointCodes: string[];
    specPointNodeIds: string[];
    courseHrefBase: string;
  }): Promise<ReviewInputBundle>;
}
