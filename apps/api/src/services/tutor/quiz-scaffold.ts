/**
 * Run-015 proposal #6c — the deterministic quiz scaffold (operator trace
 * 1a14f63469aea2e1 "Proceed with #6c"; proposed in 1a14eb4561e56285, T1-sized).
 *
 * The defect class it kills: "quiz me on this" was FULLY model-interpreted —
 * the serving model improvised quiz questions, which drifted across papers
 * (run-013 diagnosis defect (2)) and, before the v11 law, asked the learner
 * to recall specification codes (the spec-as-content defect, 1a14eb4561e56285).
 * The v11 prompt law (#6a) and the render-side stripSpecQuizDebris (#6b) gate
 * the model's output; #6c removes the improvisation itself: when the ask is
 * quiz-shaped AND a session paper pin is active, the quiz is served from the
 * PINNED PAPER'S OWN structured bank rows — deterministic selection, real
 * QP stems, the paper's own numbering and marks. R-LLM doctrine: the LLM
 * formats; the data layer decides WHAT is asked.
 *
 * Advisory posture (the pin tier's own law): no pin, no structured bank
 * rows, or any loader failure → the ask proceeds exactly as before (the v11
 * law still governs the improvised quiz) — the scaffold never gates an ask.
 *
 * Scope law: the qnum filter honours a question-number ref in the ask
 * ("quiz me on question 2" scaffolds question 2 alone); without one the
 * scaffold serves the paper's opening questions in external_ref order,
 * capped at QUIZ_SCAFFOLD_MAX_QUESTIONS (disclosed in the prompt block).
 * Rows without the paper's own numbering (external_ref null) are dropped —
 * a scaffold without the paper's own labels is not a deterministic scaffold.
 */
import { parseFetchQuery } from "./fetch-parser";
import { hygienicStem } from "./stem-hygiene";
import type { SqlFn } from "./sql";
import type { EvidenceItem } from "./evidence";

/** The scaffold cap — the paper's opening questions, deterministic order. */
export const QUIZ_SCAFFOLD_MAX_QUESTIONS = 5;
/** Per-stem char bound in the prompt block (the pin's QP chunks in SOURCES
 *  carry the full verbatim text; the scaffold line is the deterministic
 *  selection spine). */
export const QUIZ_STEM_BOUND = 400;

/**
 * Precision-first quiz-intent detection on the ASK text (the same doctrine
 * as the #6b strip: a missed detection degrades to the improvised path, so
 * the patterns prefer MISSING a rare ask over firing on subject vocabulary —
 * "test" is itself chemistry content: flame test, test for sulfate ions).
 * Every pattern is word-bounded; "check my answer to question 2" (grading)
 * and "explain question 4" (the resolver path) never fire.
 */
const QUIZ_ASK_PATTERNS: ReadonlyArray<RegExp> = [
  /\bquiz\s+me\b/i, // quiz me (on this)
  /\b(?:do|start|give|run|want|have|try)\b[^.?!]{0,24}\bquiz\b/i, // do/start/give/run/want a quiz
  /\bquiz\b[^.?!]{0,24}\b(?:on|about|from)\b/i, // a quiz on electrolysis / from this paper
  /\btest\s+me\b/i, // test me (on this paper)
  /\btest\s+my\b/i, // test my understanding / knowledge
  /\bask\s+me\s+(?:some\s+|a\s+few\s+)?questions\b/i, // ask me some questions
  /\bpractice\s+questions?\b/i, // practice questions
  /\b(?:give|set)\s+me\s+(?:some\s+|a\s+few\s+)?questions\b/i, // give/set me (some) questions
  /\bdrill\s+me\b/i, // drill me (on bonding)
];

/** True when the ask text is quiz-shaped (deterministic, no LLM). */
export function isQuizAsk(query: string): boolean {
  if (query == null) return false;
  const text = query.trim();
  if (text.length === 0) return false;
  return QUIZ_ASK_PATTERNS.some((re) => re.test(text));
}

/** One scaffolded question — the paper's own label, a hygienic stem, marks. */
export interface QuizScaffoldQuestion {
  /** the paper's own external_ref ("1", "2(a)", …) — never null here */
  number: string;
  stem: string;
  marks: number | null;
  commandWord: string | null;
}

/** The deterministic quiz payload for one pinned paper. */
export interface QuizScaffold {
  paperId: string;
  /** the ACTIVE PAPER CONTEXT label (code + session) the block renders */
  label: string;
  questions: QuizScaffoldQuestion[];
}

/** The bank row shape the loader reads (the fetchPaper band's projection). */
interface BankQuestionRow {
  id: string;
  external_ref: string | null;
  question_type: string | null;
  stem: string;
  marks: number | null;
  command_word: string | null;
}

/** The leading question number of the paper's own external_ref ("2",
 *  "2(a)", "Q2", "Q 2" → "2"); null when the ref carries none. The
 *  corpus mixes bare and q-prefixed refs, so the q-anchored
 *  questionNumberOf (paper-figures) alone would drop bare-numbered rows. */
function leadingQuestionNumber(externalRef: string): string | null {
  const m = /^q?\s*0*(\d+)/i.exec(externalRef.trim());
  return m == null ? null : String(Number.parseInt(m[1]!, 10));
}

/**
 * loadQuizScaffold — the pinned paper's structured bank questions, the
 * fetchPaper band's query VERBATIM (active-policy AGNOSTIC, gold-v1 FETCH
 * semantics: the pin gate upstream already guarantees a VALIDATED paper
 * row; the bank rows ride its serving law). Stems go through the same
 * serve-side hygiene projection as both bank bands (one law, all three).
 * Returns null when the paper carries no scaffoldable rows (fail-open).
 */
export async function loadQuizScaffold(
  sql: SqlFn,
  paperId: string,
  label: string,
  askText: string,
): Promise<QuizScaffold | null> {
  if (sql == null || paperId == null || paperId.trim() === "") return null;
  const qnum = parseFetchQuery(askText ?? "").qnum;
  const rows = (await sql`
    select q.id, q.external_ref, q.question_type, q.stem, q.marks, q.command_word
    from questions q
    where q.exam_paper_id = ${paperId}
    order by q.external_ref, q.id`) as unknown as BankQuestionRow[];

  const scaffoldable = rows
    .filter((r) => r.external_ref != null && String(r.external_ref).trim() !== "")
    .filter((r) => qnum == null || leadingQuestionNumber(String(r.external_ref)) === String(qnum))
    .map<QuizScaffoldQuestion>((r) => ({
      number: String(r.external_ref).trim(),
      // the same serve-side stem projection as the listing + whole-paper bands
      stem: hygienicStem(String(r.stem)).slice(0, QUIZ_STEM_BOUND),
      marks: r.marks == null ? null : Number(r.marks),
      commandWord: r.command_word == null ? null : String(r.command_word),
    }))
    .slice(0, QUIZ_SCAFFOLD_MAX_QUESTIONS);

  if (scaffoldable.length === 0) return null;
  return { paperId: String(paperId), label: String(label ?? ""), questions: scaffoldable };
}

/**
 * T-TUTOR-EXP-1 (005) — the scaffold-less quiz citation floor.
 *
 * The measured defect (2026-11-03 live 4CH1 battery): an improvised "quiz me
 * on this" turn cited a tangential chunk (alkenes in a rate-of-reaction
 * quiz). RRF ranks only RELATIVELY, so a weakly-related chunk still survives
 * any top-k cap when the candidate pool is thin — the model then reads it as
 * quiz-scope. On quiz-shaped asks WITHOUT a deterministic scaffold (no pin,
 * or the pin carried no scaffoldable rows) the filler pool therefore keeps
 * only STRONGLY fused citations: a document chunk stays when its fusedScore
 * is at least QUIZ_FLOOR_RATIO of the best chunk's fusedScore in the same
 * ask. Deterministic and scale-free (RRF's absolute magnitudes carry no
 * meaning; the ratio does). KNOWLEDGE_NODE / LEARNER_WORK items pass
 * through untouched — the intent anchors and the learner's own words are
 * relevant by construction, not by fused rank. With a scaffold present the
 * floor never fires: the paper's own bank questions lead and the law is the
 * scaffold's.
 */
export const QUIZ_FLOOR_RATIO = 0.5;

export function quizCitationFloor(
  items: ReadonlyArray<EvidenceItem>,
): EvidenceItem[] {
  let best = 0;
  for (const item of items) {
    if (item.source === "KNOWLEDGE_NODE" || item.source === "LEARNER_WORK") continue;
    if (item.fusedScore > best) best = item.fusedScore;
  }
  if (best <= 0) return [...items];
  const floor = best * QUIZ_FLOOR_RATIO;
  return items.filter(
    (item) =>
      item.source === "KNOWLEDGE_NODE" ||
      item.source === "LEARNER_WORK" ||
      item.fusedScore >= floor,
  );
}
