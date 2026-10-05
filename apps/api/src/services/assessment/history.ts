/**
 * AttemptHistoryService port — the Review Hub minimal slice read model
 * (T-MIG-030 tranche 1; charter §14).
 *
 * Frozen law (AttemptHistoryService.java, syllabai-core @ 6cad6ef):
 *   - Strictly a READ model over the assessment evidence tables: writes
 *     nothing, derives no mastery, invents no claims ("no parallel tracking
 *     systems").
 *   - historyFor(learnerId, requestedLimit): clampLimit — null → 50,
 *     < 1 → 50, else min(requestedLimit, 100) (:134-143); page =
 *     attempts.findByLearnerIdOrderByCreatedAtDesc(learnerId, PageRequest(0,
 *     limit)) + attempts.countByLearnerId(learnerId) for total.
 *   - Item assembly (toItem :81-119): MCQ = chosenOptionId != null; chosen
 *     + correct labels resolved from question.options() (lazy in-tx in Java —
 *     batched here, disclosed); implicatedMisconceptionIds = the chosen
 *     option's misconceptionNodeId as a single-element list (or empty);
 *     structured = answers.findByAttemptIdOrderByQuestionPartId (per-attempt,
 *     questionPart join in-statement); attempt-level marks = part-mark sum
 *     ONLY when every part's marksAwarded is non-null (else null, and
 *     attempt-level correct stays the attempt row's value only when settled);
 *     topic code/title via the knowledge graph (graph.node — per-question
 *     N+1 in Java, batched to the page's distinct node ids here).
 *   - excerpt (:122-129): stem.strip(), collapse all whitespace runs to one
 *     space, cap 220 chars with a trailing '…' (U+2026) when truncated.
 *
 * Fetch-strategy parity (the frozen repo's own precedent — QuestionVersionRepo
 * "batched counterpart" note): join/batch what the EntityGraph fetched lazily,
 * never change a serving boundary. AttemptRepository.findByIdForUpdate
 * (PESSIMISTIC_WRITE) is marking-flow law — NOT a call site of this slice.
 */
import type { SqlFn } from "./sql";
import { NotFoundException } from "../identity/errors";
import type {
  AttemptHistoryView,
  AttemptHistoryItem,
  AttemptHistoryPartItem,
  AttemptMarkingState,
  AnswerMarkingState,
  QuestionType,
} from "./types";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const STEM_EXCERPT_CHARS = 220;

/** Attempt row joined with its question (EntityGraph "question" parity). */
interface AttemptJoinedRow {
  id: string;
  question_id: string;
  chosen_option_id: string | null;
  correct: boolean;
  marks_awarded: number | null;
  response_time_ms: number;
  confidence_level: number | null;
  self_doubt_flag: boolean;
  timed_condition: boolean;
  marking_state: AttemptMarkingState;
  evidence_emitted: boolean;
  created_at: string;
  q_question_type: QuestionType;
  q_external_ref: string | null;
  q_command_word: string | null;
  q_stem: string;
  q_marks: number;
  q_primary_topic_node_id: string | null;
}

/** AttemptHistoryService.java:122-129 — strip, collapse, cap with '…'. */
export function excerpt(stem: string): string {
  const collapsed = stem.trim().replace(/\s+/g, " ");
  if (collapsed.length <= STEM_EXCERPT_CHARS) {
    return collapsed;
  }
  return collapsed.slice(0, STEM_EXCERPT_CHARS - 1) + "…";
}

/** AttemptHistoryService.java:134-143 — null/invalid → default; else capped. */
export function clampLimit(requestedLimit: number | null | undefined): number {
  if (requestedLimit === null || requestedLimit === undefined) {
    return DEFAULT_LIMIT;
  }
  if (requestedLimit < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(requestedLimit, MAX_LIMIT);
}

export class AttemptHistoryReader {
  constructor(private readonly sql: SqlFn) {}

  async historyFor(
    learnerId: string,
    requestedLimit: number | null | undefined,
  ): Promise<AttemptHistoryView> {
    const limit = clampLimit(requestedLimit);

    // Page + total (AttemptRepository.findByLearnerIdOrderByCreatedAtDesc
    // with the EntityGraph question join in the same statement — R-M-LAZY).
    const rows = (await this.sql`
      select a.id, a.question_id, a.chosen_option_id, a.correct, a.marks_awarded,
             a.response_time_ms, a.confidence_level, a.self_doubt_flag,
             a.timed_condition, a.marking_state, a.evidence_emitted, a.created_at,
             q.question_type as q_question_type, q.external_ref as q_external_ref,
             q.command_word as q_command_word, q.stem as q_stem,
             q.marks as q_marks, q.primary_topic_node_id as q_primary_topic_node_id
      from attempts a
      join questions q on q.id = a.question_id
      where a.learner_id = ${learnerId}
      order by a.created_at desc
      limit ${limit}
    `) as unknown as AttemptJoinedRow[];

    const totalRows = await this.sql`
      select count(*) as total from attempts where learner_id = ${learnerId}
    `;
    const total = Number(totalRows[0]?.total ?? 0);

    // MCQ label resolution — Java lazy-loads question.options() inside the
    // read-only transaction per question; batched here for the page's
    // distinct question ids (fetch-strategy parity, boundary unchanged).
    const mcqQuestionIds = [
      ...new Set(
        rows
          .filter((r) => r.chosen_option_id !== null)
          .map((r) => r.question_id),
      ),
    ];
    const optionsByQuestion = new Map<string, OptionRow[]>();
    if (mcqQuestionIds.length > 0) {
      const optionRows = (await this.sql`
        select id, question_id, label, is_correct, misconception_node_id
        from question_options
        where question_id = any(${mcqQuestionIds}::uuid[])
        order by ordering
      `) as unknown as OptionRow[];
      for (const o of optionRows) {
        const list = optionsByQuestion.get(o.question_id) ?? [];
        list.push(o);
        optionsByQuestion.set(o.question_id, list);
      }
    }

    // Structured parts — answers.findByAttemptIdOrderByQuestionPartId
    // (EntityGraph questionPart join in-statement → JOIN; per-attempt order
    // by question_part_id verbatim).
    const partsByAttempt = new Map<string, AttemptHistoryPartItem[]>();
    for (const r of rows) {
      if (r.chosen_option_id !== null) continue; // MCQ: parts stay []
      const partRows = (await this.sql`
        select ans.question_part_id, ans.marks_awarded, ans.marking_state,
               qp.label, qp.marks
        from answers ans
        join question_parts qp on qp.id = ans.question_part_id
        where ans.attempt_id = ${r.id}
        order by ans.question_part_id
      `) as unknown as Array<Record<string, unknown>>;
      partsByAttempt.set(
        r.id,
        partRows.map(mapPartItem),
      );
    }

    // Topic code/title — graph.node(question.primaryTopicNodeId()) per
    // question in Java (throws NotFound when the node is missing); batched
    // to the page's distinct non-null ids here, same 404 contract enforced
    // at assembly time (a missing node still fails the request).
    const topicIds = [
      ...new Set(
        rows
          .map((r) => r.q_primary_topic_node_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    const topicById = new Map<string, NodeRow>();
    if (topicIds.length > 0) {
      const nodeRows = (await this.sql`
        select id, code, title from knowledge_nodes
        where id = any(${topicIds}::uuid[])
      `) as unknown as NodeRow[];
      for (const n of nodeRows) topicById.set(n.id, n);
    }

    const items: AttemptHistoryItem[] = [];
    for (const r of rows) {
      const mcq = r.chosen_option_id !== null;
      const options = optionsByQuestion.get(r.question_id) ?? [];

      let chosenLabel: string | null = null;
      let correctLabel: string | null = null;
      let implicatedMisconceptionIds: string[] = [];
      if (mcq) {
        for (const option of options) {
          if (option.id === r.chosen_option_id) {
            chosenLabel = option.label;
            if (option.misconception_node_id !== null) {
              implicatedMisconceptionIds = [option.misconception_node_id];
            }
          }
          if (option.is_correct) {
            correctLabel = option.label;
          }
        }
      }

      let parts: AttemptHistoryPartItem[] = [];
      let correct: boolean | null = null;
      let marksAwarded = r.marks_awarded;
      if (!mcq) {
        parts = partsByAttempt.get(r.id) ?? [];
        if (parts.every((p) => p.marksAwarded !== null)) {
          marksAwarded = parts.reduce((sum, p) => sum + (p.marksAwarded ?? 0), 0);
          correct = r.correct;
        } else {
          marksAwarded = null;
        }
      } else {
        correct = r.correct;
      }

      let topicCode: string | null = null;
      let topicTitle: string | null = null;
      const topicId = r.q_primary_topic_node_id;
      if (topicId !== null) {
        const topic = topicById.get(topicId);
        if (!topic) {
          // graph.node() parity: missing node → NotFoundException → 404.
          throw new NotFoundException("knowledge node", topicId);
        }
        topicCode = topic.code;
        topicTitle = topic.title;
      }

      items.push({
        attemptId: r.id,
        questionId: r.question_id,
        questionType: r.q_question_type,
        externalRef: r.q_external_ref,
        commandWord: r.q_command_word,
        stemExcerpt: excerpt(r.q_stem),
        marksTotal: r.q_marks,
        topicNodeId: topicId,
        topicCode,
        topicTitle,
        correct,
        marksAwarded,
        markingState: r.marking_state,
        evidenceEmitted: r.evidence_emitted,
        chosenOptionLabel: chosenLabel,
        correctOptionLabel: correctLabel,
        implicatedMisconceptionIds,
        selfDoubtFlag: r.self_doubt_flag,
        timedCondition: r.timed_condition,
        confidenceLevel: r.confidence_level,
        responseTimeMs: Number(r.response_time_ms),
        attemptedAt: new Date(r.created_at).toISOString(),
        parts,
      });
    }

    return { learnerId, total, returned: items.length, attempts: items };
  }
}

interface OptionRow {
  id: string;
  question_id: string;
  label: string;
  is_correct: boolean;
  misconception_node_id: string | null;
}

interface NodeRow {
  id: string;
  code: string;
  title: string;
}

function mapPartItem(row: Record<string, unknown>): AttemptHistoryPartItem {
  return {
    partId: String(row.question_part_id),
    label: String(row.label),
    marksPossible: Number(row.marks),
    marksAwarded:
      row.marks_awarded === null || row.marks_awarded === undefined
        ? null
        : Number(row.marks_awarded),
    markingState: String(row.marking_state) as AnswerMarkingState,
  };
}
