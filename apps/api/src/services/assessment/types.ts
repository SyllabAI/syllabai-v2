/**
 * Assessment view + request shapes (T-MIG-030 tranche 1) — verbatim ports of
 * the frozen DTO records (AttemptResultView / StructuredAttemptResultView /
 * AttemptHistoryView / SubmitAnswerRequest / StructuredSubmitRequest /
 * PartAnswerRequest). Local types keep tranche 1 contract-independent
 * (contracts-first §4.1: the @syllabai/contracts import swap for the wire
 * shapes happens at tranche 2 with the route factories, gated on T-MIG-018
 * / PR #26 — same staging as T-MIG-021).
 *
 * MarkingState is treated as the stored string — the DB CHECK constrains it,
 * not this layer (same doctrine as T-MIG-020's kind treatment and T-MIG-021's
 * status treatment). Question.Type likewise: 'MCQ_SINGLE' | 'SHORT_ANSWER' |
 * 'STRUCTURED' (Question.java:15 — MCQ end-to-end; STRUCTURED = multi-part).
 */

export type QuestionType = "MCQ_SINGLE" | "SHORT_ANSWER" | "STRUCTURED";

export type AttemptMarkingState =
  | "AUTO_GRADED"
  | "PENDING"
  | "SMART_MARKED"
  | "HUMAN_MARKED"
  | "OVERRIDDEN"
  | "SELF_MARKED";

export type AnswerMarkingState =
  | "PENDING"
  | "SMART_MARKED"
  | "HUMAN_MARKED"
  | "OVERRIDDEN"
  | "SELF_MARKED";

/** AttemptResultView.java — the MCQ submit wire shape (201). */
export interface AttemptResultView {
  attemptId: string;
  questionId: string;
  correct: boolean;
  marksAwarded: number;
  marksTotal: number;
  correctOptionLabel: string | null;
  implicatedMisconceptionIds: string[];
  submittedAt: string;
}

/** StructuredAttemptResultView.java — the structured submit wire shape (201). */
export interface StructuredAttemptResultView {
  attemptId: string;
  questionId: string;
  marksPossible: number;
  markingState: AttemptMarkingState;
  submittedAt: string;
  parts: StructuredPartResult[];
}

export interface StructuredPartResult {
  partId: string;
  label: string;
  marksPossible: number;
  markingState: AnswerMarkingState;
  marksAwarded: number | null;
}

/** AttemptHistoryView.java — the Review Hub minimal slice wire shape (200). */
export interface AttemptHistoryView {
  learnerId: string;
  total: number;
  returned: number;
  attempts: AttemptHistoryItem[];
}

/** AttemptHistoryView.Item — one past attempt with everything for review. */
export interface AttemptHistoryItem {
  attemptId: string;
  questionId: string;
  questionType: QuestionType;
  externalRef: string | null;
  commandWord: string | null;
  stemExcerpt: string;
  marksTotal: number;
  topicNodeId: string | null;
  topicCode: string | null;
  topicTitle: string | null;
  /** null for structured attempts pending authoritative marking */
  correct: boolean | null;
  /** null while marking is pending */
  marksAwarded: number | null;
  markingState: AttemptMarkingState;
  evidenceEmitted: boolean;
  /** MCQ only: the option label the learner chose */
  chosenOptionLabel: string | null;
  /** MCQ only: the correct option label (already revealed at submit) */
  correctOptionLabel: string | null;
  /** MCQ only: misconception node the chosen distractor expresses */
  implicatedMisconceptionIds: string[];
  selfDoubtFlag: boolean;
  timedCondition: boolean;
  confidenceLevel: number | null;
  responseTimeMs: number;
  attemptedAt: string;
  /** structured attempts only */
  parts: AttemptHistoryPartItem[];
}

/** AttemptHistoryView.PartItem — labels and mark outcome only. */
export interface AttemptHistoryPartItem {
  partId: string;
  label: string;
  marksPossible: number;
  marksAwarded: number | null;
  markingState: AnswerMarkingState;
}

/** SubmitAnswerRequest.java — MCQ submit input (@Valid binding is tranche 2). */
export interface SubmitAnswerRequest {
  questionId: string;
  chosenOptionId: string;
  responseTimeMs: number;
  confidence: number | null;
  selfDoubtFlag: boolean;
  timedCondition: boolean;
}

/** PartAnswerRequest.java. */
export interface PartAnswerRequest {
  partId: string;
  answerText: string | null;
}

/** StructuredSubmitRequest.java — structured submit input. */
export interface StructuredSubmitRequest {
  questionId: string;
  partAnswers: PartAnswerRequest[];
  responseTimeMs: number;
  confidence: number | null;
  selfDoubtFlag: boolean;
  timedCondition: boolean;
}
